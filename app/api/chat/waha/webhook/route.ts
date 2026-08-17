import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tratarErroPrisma } from "@/lib/api";
import { exigirServico } from "@/lib/autorizacao";
import { escalarConversa, registrarEntrada } from "@/lib/chat-registro";
import { baixarMidia } from "@/lib/chat-midia";
import { publicar } from "@/lib/chat-eventos";
import { assuntoExigeGente, classificar, configBot } from "@/lib/chat-bot";
import { decidir, type EstadoConversa, type OfertaFeita } from "@/lib/chat-fluxo";
import { dossieDe, identificar, regraDaCarteira } from "@/lib/siscobra";
import { enviarPeloGateway } from "@/lib/chat-envio";
import { configWaha, diagnosticoDoEvento, mensagemDoEvento, urlDaMidia } from "@/lib/waha";

// POST /api/chat/waha/webhook — o gateway de WhatsApp entregando direto, sem
// n8n no meio. É o MODO DIRETO (decisão 29), o caminho de teste.
//
// Portão: o MESMO `exigirServico` do webhook do n8n. Não é economia de código —
// é para existir um segredo só (`CHAT_SERVICE_TOKEN`) valendo em toda porta de
// máquina. O WAHA manda o cabeçalho porque a sessão é criada por este app já
// com `customHeaders` (ver `configWaha`/`conectar` em lib/waha.ts).
//
// O que acontece depois de gravar depende de haver robô ligado:
//
//   sem OLLAMA_URL → a mensagem entra ESCALADA e a conversa cai na fila. Ficar
//                    em "com o robô" esconderia o devedor esperando um
//                    atendimento automático que ninguém ligou.
//   com OLLAMA_URL → a conversa fica com o robô, que responde na hora e passa
//                    para gente assim que o assunto encostar em dívida
//                    (lib/chat-bot.ts).
const MOTIVO_SEM_ROBO = "sem robô ligado (modo direto)";

export async function POST(req: Request): Promise<NextResponse> {
  const negado = exigirServico(req);
  if (negado) return negado.resposta;

  let evento: unknown;
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON)." }, { status: 400 });
  }

  const msg = mensagemDoEvento(evento);

  // Evento que não vira mensagem (status da sessão, eco da própria resposta,
  // grupo) responde 200 "ignorado" de propósito: um erro faria o gateway
  // reentregar para sempre algo que nunca vai ser aceito.
  //
  // Mas ignorar em SILÊNCIO foi um defeito real: o gateway entregava, o app
  // respondia 200 e a mensagem não aparecia na fila — sem nenhum rastro de
  // onde ela morreu. O diagnóstico não leva conteúdo nem número (LGPD): só o
  // suficiente para responder "por que isto não apareceu?".
  if (!msg) {
    console.info("[chat/waha] evento ignorado —", diagnosticoDoEvento(evento));
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const bot = configBot();

  try {
    const registro = await registrarEntrada({
      telefone: msg.telefone,
      nome: msg.nome,
      autor: "devedor",
      corpo: msg.corpo,
      waId: msg.waId,
      escalar: !bot,
      motivoEscalonamento: MOTIVO_SEM_ROBO,
      midiaTipo: msg.midia,
      midiaMime: msg.midiaMime,
    });

    // O anexo desce DEPOIS da mensagem estar gravada, e a falha dele é
    // engolida: a fala do devedor não pode depender de um download. O pior caso
    // aqui é a operadora ver "[áudio]" sem poder ouvir — não é a conversa sumir.
    if (msg.midiaUrl && registro.mensagemId) {
      await guardarAnexo(registro.mensagemId, msg.midiaUrl, msg.midiaMime);
    }

    // Avisa as telas abertas. Depois do anexo, para o áudio já estar tocável
    // quando a conversa piscar na fila; e só quando algo REALMENTE entrou —
    // reentrega não acende luz para uma mensagem que a operadora já leu.
    if (!registro.duplicada) {
      publicar({ tipo: "mensagem", conversaId: registro.conversaId });
    }

    // O robô fala DEPOIS de a mensagem estar gravada e a fila já ter piscado.
    // Assim, se ele demorar, travar ou dizer bobagem, o devedor já está visível
    // para quem atende — o atendimento nunca depende do modelo estar bem.
    //
    // Só quando a conversa ainda está com ele: `situacao` vem do registro, e
    // "humana" significa que uma operadora assumiu e o robô cala (decisão 28).
    if (bot && !registro.duplicada && registro.situacao === "bot") {
      await responderComRobo(registro.conversaId, msg.telefone, msg.corpo);
    }

    return NextResponse.json({
      ok: true,
      conversaId: registro.conversaId,
      situacao: registro.situacao,
      ...(registro.duplicada ? { duplicada: true } : {}),
    });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

/**
 * O robô atende: classifica a intenção, busca o dado e responde por molde.
 *
 * A decisão 32 mudou o que "responder" significa aqui. O modelo não escreve
 * mais nada que o devedor leia — ele devolve um rótulo, `lib/chat-fluxo.ts`
 * decide, e o texto sai de `lib/chat-respostas.ts` preenchido com campo do
 * Siscobra. Por isso o robô pode conduzir vários turnos sem que o risco cresça
 * a cada um: não há turno redigido por modelo.
 *
 * Toda saída que não é "respondeu" termina em ESCALAR, nunca em silêncio —
 * modelo fora do ar, banco fora do ar, rótulo desconhecido e falha de envio dão
 * todos no mesmo lugar: a conversa na fila, com o motivo escrito.
 */
async function responderComRobo(
  conversaId: string,
  telefone: string,
  ultimaFala: string,
): Promise<void> {
  const cfg = configBot();
  if (!cfg) return;

  // A trava de entrada continua, e agora é a primeira de três. Ela pega por
  // palavra o que nunca deve chegar ao modelo; a segunda é o rótulo devolvido
  // (`exigeGente`); a terceira é o fluxo não ter molde para o caso.
  const exige = assuntoExigeGente(ultimaFala);
  if (exige) {
    await escalarConversa(conversaId, exige);
    publicar({ tipo: "mensagem", conversaId });
    return;
  }

  const conversa = await prisma.conversa.findUnique({
    where: { id: conversaId },
    select: {
      nome: true, siscobraDevcod: true, siscobraCarcod: true,
      identificadaEm: true, saldo: true, vencidoDesde: true,
      documentoPendente: true, nomePendente: true, saudacoes: true, oferta: true,
    },
  });
  if (!conversa) return;

  const historico = await prisma.conversaMensagem.findMany({
    where: { conversaId, autor: { in: ["devedor", "bot"] } },
    orderBy: { criadoEm: "asc" },
    select: { autor: true, corpo: true },
    take: 20,
  });

  const leitura = await classificar(cfg, historico, ultimaFala);

  const acao = await decidir(
    leitura,
    {
      devcod: conversa.siscobraDevcod,
      carcod: conversa.siscobraCarcod,
      identificadaEm: conversa.identificadaEm,
      nome: conversa.nome,
      saudacoes: conversa.saudacoes,
      saldo: conversa.saldo,
      vencidoDesde: conversa.vencidoDesde,
      documentoPendente: conversa.documentoPendente,
      nomePendente: conversa.nomePendente,
      oferta: conversa.oferta ? (JSON.parse(conversa.oferta) as OfertaFeita) : null,
    },
    { identificar, regraDaCarteira },
  );

  if (acao.tipo === "escalar") {
    // O aviso é o que mudou para melhor na experiência: antes a conversa
    // simplesmente parava de responder e ia para a fila. Silêncio depois de uma
    // pergunta é onde o devedor desiste — ele não sabe se foi ouvido.
    if (acao.aviso) await falar(conversaId, telefone, acao.aviso);
    await escalarConversa(conversaId, acao.motivo);
    publicar({ tipo: "mensagem", conversaId });
    console.info("[chat/bot] escalou —", acao.motivo);
    return;
  }

  const entregou = await falar(conversaId, telefone, acao.texto);
  if (!entregou) {
    await escalarConversa(conversaId, "falha ao entregar a resposta do robô");
    publicar({ tipo: "mensagem", conversaId });
    return;
  }

  if (acao.estado) {
    await prisma.conversa.update({
      where: { id: conversaId },
      data: paraOBanco(acao.estado),
    });
    // Identificou agora: o dossiê é buscado uma vez e congelado, para a
    // operadora ter o quadro ao assumir sem o app consultar o CRM a cada tela.
    if (acao.estado.devcod && acao.estado.carcod) {
      const d = await dossieDe(acao.estado.devcod, acao.estado.carcod);
      if (d) {
        await prisma.conversa.update({
          where: { id: conversaId },
          data: {
            carteira: d.carteira,
            dossie: JSON.stringify(d),
            dossieEm: new Date(),
          },
        });
      }
    }
  }
  publicar({ tipo: "mensagem", conversaId });
}

/**
 * Traduz o estado do fluxo para as colunas da conversa.
 *
 * Existe porque os dois lados chamam a mesma coisa por nomes diferentes, e com
 * razão: no fluxo é `devcod` (o conceito do Siscobra), no banco é
 * `siscobraDevcod` (a origem, explícita entre dezenas de outras colunas).
 * Espalhar um no outro parecia funcionar e não funciona — o Prisma recusa a
 * chave que não conhece, e a identificação inteira se perdia num erro que só
 * aparecia com a rota rodando.
 *
 * Só escreve o que veio: chave ausente no parcial não vira `null` no banco.
 */
function paraOBanco(e: Partial<EstadoConversa>) {
  const dados: Record<string, unknown> = {};
  if ("devcod" in e) dados.siscobraDevcod = e.devcod;
  if ("carcod" in e) dados.siscobraCarcod = e.carcod;
  if ("identificadaEm" in e) dados.identificadaEm = e.identificadaEm;
  if ("nome" in e) dados.nome = e.nome;
  if ("saudacoes" in e) dados.saudacoes = e.saudacoes;
  if ("saldo" in e) dados.saldo = e.saldo;
  if ("vencidoDesde" in e) dados.vencidoDesde = e.vencidoDesde;
  if ("documentoPendente" in e) dados.documentoPendente = e.documentoPendente;
  if ("nomePendente" in e) dados.nomePendente = e.nomePendente;
  // JSON em texto: o SQLite não tem coluna de objeto, mesmo padrão de `dossie`.
  if ("oferta" in e) dados.oferta = e.oferta ? JSON.stringify(e.oferta) : null;
  return dados;
}

/**
 * Entrega e grava, nessa ordem (decisão 28).
 *
 * Mensagem fantasma na thread é pior que mensagem repetida — e aqui seria pior
 * ainda, porque ninguém escreveu aquilo à mão para lembrar.
 */
async function falar(
  conversaId: string,
  telefone: string,
  texto: string,
): Promise<boolean> {
  const entrega = await enviarPeloGateway(telefone, texto);
  if (!entrega.ok) return false;
  await registrarEntrada({
    telefone,
    autor: "bot",
    corpo: texto,
    waId: entrega.waId,
  });
  publicar({ tipo: "mensagem", conversaId });
  return true;
}

async function guardarAnexo(
  mensagemId: string,
  urlBruta: string,
  mime: string | null,
): Promise<void> {
  const cfg = configWaha();
  if (!cfg) return;
  const url = urlDaMidia(cfg, urlBruta);
  if (!url) return;

  const salva = await baixarMidia(url, cfg.apiKey, mensagemId, mime);
  if (!salva) {
    console.info("[chat/waha] anexo não baixado — a mensagem ficou só com o marcador");
    return;
  }
  await prisma.conversaMensagem.update({
    where: { id: mensagemId },
    data: {
      midiaArquivo: salva.arquivo,
      midiaBytes: salva.bytes,
      ...(salva.mime ? { midiaMime: salva.mime } : {}),
    },
  });
}
