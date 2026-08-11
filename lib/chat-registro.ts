// Gravação de uma mensagem que chegou pelo WhatsApp.
//
// Existem DUAS portas de entrada para a mesma coisa — o webhook do n8n
// (`/api/chat/webhook`, produção) e o do gateway direto
// (`/api/chat/waha/webhook`, teste; decisão 29) — e as duas precisam da mesma
// máquina de estados: conversa criada sem corrida, encerrada que reabre, robô
// que não rouba de volta o que já está com gente, reentrega que não duplica.
//
// Uma cópia disso em cada rota seria a receita para as duas divergirem no pior
// momento. Aqui é o único lugar onde a conversa muda de estado por causa de uma
// mensagem que chegou; as rotas cuidam só do portão e do formato de quem chama.
import { prisma } from "@/lib/prisma";

export type EntradaConversa = {
  /** Já normalizado por `normalizarTelefone` — é a identidade da conversa. */
  telefone: string;
  nome?: string | null;
  autor: "devedor" | "bot";
  corpo: string;
  waId?: string | null;

  // Identificação: só vale COMPLETA (código do devedor + a marca de que houve
  // conferência de CPF e nascimento). Meia identificação destravaria valor sem
  // prova — ver `podeRevelarValores` em lib/conversas.ts.
  siscobraDevcod?: number | null;
  siscobraCarcod?: number | null;
  carteira?: string | null;
  identificado?: boolean;

  escalar?: boolean;
  motivoEscalonamento?: string | null;

  dossie?: Record<string, unknown> | null;

  // Anexo: o TIPO é gravado junto com a mensagem; o ARQUIVO chega depois, pela
  // rota, porque baixá-lo pode demorar e a fala do devedor não espera download.
  midiaTipo?: string | null;
  midiaMime?: string | null;
};

export type ResultadoEntrada = {
  conversaId: string;
  situacao: string;
  duplicada: boolean;
  /** Null quando a mensagem era reentrega (já estava gravada). */
  mensagemId: string | null;
};

export async function registrarEntrada(
  d: EntradaConversa,
): Promise<ResultadoEntrada> {
  const identificou = d.identificado === true && !!d.siscobraDevcod;

  const conversa = await prisma.$transaction(async (tx) => {
    const existente = await tx.conversa.findUnique({
      where: { telefone: d.telefone },
      select: { id: true, situacao: true, identificadaEm: true },
    });

    const agora = new Date();
    const dossie = d.dossie ? JSON.stringify(d.dossie) : undefined;

    if (!existente) {
      return tx.conversa.create({
        data: {
          telefone: d.telefone,
          nome: d.nome ?? null,
          situacao: d.escalar ? "fila" : "bot",
          motivoEscalonamento: d.escalar
            ? (d.motivoEscalonamento ?? "não informado")
            : null,
          siscobraDevcod: d.siscobraDevcod ?? null,
          siscobraCarcod: d.siscobraCarcod ?? null,
          carteira: d.carteira ?? null,
          identificadaEm: identificou ? agora : null,
          dossie: dossie ?? null,
          dossieEm: dossie ? agora : null,
          ultimaMensagemEm: agora,
        },
        select: { id: true, situacao: true },
      });
    }

    // Conversa que já existe: a situação só anda para frente.
    //
    // - encerrada + devedor escreveu  → reabre (no robô: é atendimento novo);
    // - escalar                       → vai para a fila, MAS nunca tira de
    //                                   quem já assumiu ("humana" fica);
    // - resto                         → não mexe.
    //
    // As duas primeiras regras se somam, e isso importa: a conversa que acabou
    // de reabrir também vai para a fila se a entrada veio escalada. No modo
    // direto (sem robô do outro lado) TODA mensagem chega escalada — parar em
    // "bot" a esconderia da fila esperando um robô que não existe.
    let situacao = existente.situacao;
    if (existente.situacao === "encerrada" && d.autor === "devedor") {
      situacao = "bot";
    }
    if (d.escalar && situacao === "bot") {
      situacao = "fila";
    }

    return tx.conversa.update({
      where: { id: existente.id },
      data: {
        // Nome e dossiê só são sobrescritos quando vêm preenchidos: webhook
        // sem esses campos não pode apagar o que já se sabe (mesma regra da
        // célula vazia na importação, decisão 26).
        ...(d.nome ? { nome: d.nome } : {}),
        ...(dossie ? { dossie, dossieEm: agora } : {}),
        ...(d.siscobraDevcod ? { siscobraDevcod: d.siscobraDevcod } : {}),
        ...(d.siscobraCarcod ? { siscobraCarcod: d.siscobraCarcod } : {}),
        ...(d.carteira ? { carteira: d.carteira } : {}),
        // A marca de identificação é gravada UMA vez: ela diz quando o devedor
        // provou quem é, e reescrevê-la a cada mensagem apagaria isso.
        ...(identificou && !existente.identificadaEm
          ? { identificadaEm: agora }
          : {}),
        ...(situacao !== existente.situacao ? { situacao } : {}),
        ...(d.escalar && d.motivoEscalonamento
          ? { motivoEscalonamento: d.motivoEscalonamento }
          : {}),
        ...(situacao === "bot" && existente.situacao === "encerrada"
          ? { encerradaEm: null, responsavelId: null }
          : {}),
        ultimaMensagemEm: agora,
      },
      select: { id: true, situacao: true },
    });
  });

  // A mensagem entra FORA da transação da conversa, e a violação do UNIQUE de
  // `waId` é tratada como sucesso: é o webhook reentregando algo que já foi
  // gravado. Responder erro faria o gateway tentar de novo para sempre.
  let mensagemId: string;
  try {
    const criada = await prisma.conversaMensagem.create({
      data: {
        conversaId: conversa.id,
        autor: d.autor,
        corpo: d.corpo,
        waId: d.waId ?? null,
        midiaTipo: d.midiaTipo ?? null,
        midiaMime: d.midiaMime ?? null,
      },
      select: { id: true },
    });
    mensagemId = criada.id;
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return {
        conversaId: conversa.id,
        situacao: conversa.situacao,
        duplicada: true,
        mensagemId: null,
      };
    }
    throw e;
  }

  return {
    conversaId: conversa.id,
    situacao: conversa.situacao,
    duplicada: false,
    mensagemId,
  };
}
