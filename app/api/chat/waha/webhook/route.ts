import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tratarErroPrisma } from "@/lib/api";
import { exigirServico } from "@/lib/autorizacao";
import { registrarEntrada } from "@/lib/chat-registro";
import { baixarMidia } from "@/lib/chat-midia";
import { publicar } from "@/lib/chat-eventos";
import { configWaha, diagnosticoDoEvento, mensagemDoEvento, urlDaMidia } from "@/lib/waha";

// POST /api/chat/waha/webhook — o gateway de WhatsApp entregando direto, sem
// n8n no meio. É o MODO DIRETO (decisão 29), o caminho de teste.
//
// Portão: o MESMO `exigirServico` do webhook do n8n. Não é economia de código —
// é para existir um segredo só (`CHAT_SERVICE_TOKEN`) valendo em toda porta de
// máquina. O WAHA manda o cabeçalho porque a sessão é criada por este app já
// com `customHeaders` (ver `configWaha`/`conectar` em lib/waha.ts).
//
// A diferença de comportamento em relação ao webhook do n8n é uma só, e é o
// ponto todo do modo direto: aqui NÃO existe robô do outro lado. Toda mensagem
// entra escalada, para a conversa cair na fila da operadora em vez de ficar
// esperando um atendimento automático que ninguém ligou.
const MOTIVO = "sem robô ligado (modo direto)";

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

  try {
    const registro = await registrarEntrada({
      telefone: msg.telefone,
      nome: msg.nome,
      autor: "devedor",
      corpo: msg.corpo,
      waId: msg.waId,
      escalar: true,
      motivoEscalonamento: MOTIVO,
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
