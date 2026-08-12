import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tratarErroPrisma } from "@/lib/api";
import { exigirServico } from "@/lib/autorizacao";
import { escalarConversa, registrarEntrada } from "@/lib/chat-registro";
import { baixarMidia } from "@/lib/chat-midia";
import { publicar } from "@/lib/chat-eventos";
import { assuntoExigeGente, configBot, pensar } from "@/lib/chat-bot";
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
 * O robô lê a conversa, decide e responde — ou desiste e chama gente.
 *
 * Toda saída que não é "respondeu" termina em ESCALAR, nunca em silêncio: modelo
 * fora do ar, resposta fora de formato, tentativa de falar de valor e falha no
 * envio dão todas no mesmo lugar — a conversa na fila, com o motivo escrito. Um
 * devedor esperando um robô que travou é o defeito que ninguém vê acontecer.
 */
async function responderComRobo(
  conversaId: string,
  telefone: string,
  ultimaFala: string,
): Promise<void> {
  const cfg = configBot();
  if (!cfg) return;

  // Antes de gastar inferência: o assunto é de gente? Dívida, pagamento,
  // advogado e dado pessoal saem daqui direto para a fila, sem o modelo opinar.
  // É a trava de entrada — ver `assuntoExigeGente` para o que a levou a existir.
  const exige = assuntoExigeGente(ultimaFala);
  if (exige) {
    await escalarConversa(conversaId, exige);
    publicar({ tipo: "mensagem", conversaId });
    return;
  }

  const historico = await prisma.conversaMensagem.findMany({
    where: { conversaId, autor: { in: ["devedor", "bot"] } },
    orderBy: { criadoEm: "asc" },
    select: { autor: true, corpo: true },
    take: 20,
  });

  const decisao = await pensar(cfg, historico);

  if (!decisao.responder) {
    await escalarConversa(conversaId, decisao.motivo);
    publicar({ tipo: "mensagem", conversaId });
    console.info("[chat/bot] escalou —", decisao.motivo);
    return;
  }

  // Mesma ordem da resposta da operadora (decisão 28): entrega primeiro, grava
  // depois. Mensagem fantasma na thread é pior que mensagem repetida — e aqui
  // seria pior ainda, porque ninguém escreveu aquilo à mão para lembrar.
  const entrega = await enviarPeloGateway(telefone, decisao.texto);
  if (!entrega.ok) {
    await escalarConversa(conversaId, "falha ao entregar a resposta do robô");
    publicar({ tipo: "mensagem", conversaId });
    return;
  }

  await registrarEntrada({
    telefone,
    autor: "bot",
    corpo: decisao.texto,
    waId: entrega.waId,
  });
  publicar({ tipo: "mensagem", conversaId });
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
