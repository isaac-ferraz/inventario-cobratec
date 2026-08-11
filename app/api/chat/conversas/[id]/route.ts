import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { erro, tratarErroPrisma, validarCorpo } from "@/lib/api";
import { exigirChat } from "@/lib/autorizacao";
import { conversaSituacaoSchema } from "@/lib/validations";
import { podeMudarSituacao } from "@/lib/conversas";
import { registrarAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

// GET /api/chat/conversas/[id] — a conversa inteira + o dossiê do Siscobra.
export async function GET(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const conversa = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      nome: true,
      carteira: true,
      situacao: true,
      motivoEscalonamento: true,
      siscobraDevcod: true,
      siscobraCarcod: true,
      identificadaEm: true,
      dossie: true,
      dossieEm: true,
      criadoEm: true,
      ultimaMensagemEm: true,
      encerradaEm: true,
      responsavel: { select: { id: true, nome: true, login: true } },
      mensagens: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          autor: true,
          corpo: true,
          criadoEm: true,
          // O anexo em si sai pela rota `/midia/[mensagemId]`; aqui vai só o
          // suficiente para a tela decidir se desenha player, miniatura ou nada.
          midiaTipo: true,
          midiaMime: true,
          midiaArquivo: true,
          usuario: { select: { id: true, nome: true } },
        },
      },
    },
  });
  if (!conversa) return erro("Conversa não encontrada.", 404);

  // O dossiê é guardado como JSON em texto (SQLite não tem Json no Prisma) e
  // volta como objeto para a tela. JSON quebrado não derruba a conversa: o
  // atendimento continua sem o dossiê, que é o menos importante dos dois.
  let dossie: unknown = null;
  if (conversa.dossie) {
    try {
      dossie = JSON.parse(conversa.dossie);
    } catch {
      dossie = null;
    }
  }

  return NextResponse.json({ ...conversa, dossie });
}

// PATCH /api/chat/conversas/[id] — assumir, devolver para a fila ou encerrar.
//
// Uma rota só para as três porque são a mesma coisa: mudar a situação. As
// transições permitidas vivem em `podeMudarSituacao` (lib/conversas.ts).
export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, conversaSituacaoSchema);
  if ("resposta" in r) return r.resposta;

  const atual = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      situacao: true,
      responsavelId: true,
      responsavel: { select: { nome: true } },
    },
  });
  if (!atual) return erro("Conversa não encontrada.", 404);

  const nova = r.data.situacao;
  const permitido = podeMudarSituacao(atual.situacao, nova);
  if (!permitido.permitido) return erro(permitido.motivo, 409);

  // Tomar conversa que já está com outra atendente é conflito de atendimento,
  // não falta de permissão: o admin resolve, a colega pede. Ficar calado aqui
  // faria duas pessoas responderem o mesmo devedor.
  if (
    nova === "humana" &&
    atual.situacao === "humana" &&
    atual.responsavelId !== auth.usuario.id &&
    auth.usuario.papel !== "ADMIN"
  ) {
    return erro(
      `Esta conversa já está com ${atual.responsavel?.nome ?? "outra atendente"}.`,
      409,
    );
  }

  const agora = new Date();
  try {
    const atualizada = await prisma.$transaction(async (tx) => {
      const c = await tx.conversa.update({
        where: { id: atual.id },
        data: {
          situacao: nova,
          // Assumir prende a conversa a quem assumiu; devolver e encerrar
          // soltam, para a próxima pessoa não herdar um dono que saiu.
          responsavelId: nova === "humana" ? auth.usuario.id : null,
          encerradaEm: nova === "encerrada" ? agora : null,
        },
        select: { id: true, situacao: true, responsavelId: true },
      });

      // O marco entra na própria thread, como no helpdesk: quem abrir a
      // conversa depois entende por que o tom mudou no meio.
      await tx.conversaMensagem.create({
        data: {
          conversaId: atual.id,
          autor: "sistema",
          autorId: auth.usuario.id,
          corpo:
            nova === "humana"
              ? `${auth.usuario.nome} assumiu o atendimento.`
              : nova === "fila"
                ? `${auth.usuario.nome} devolveu a conversa para a fila.`
                : `${auth.usuario.nome} encerrou o atendimento.`,
        },
      });
      return c;
    });

    // Auditoria: quem assumiu e quem encerrou uma cobrança é exatamente o tipo
    // de pergunta que aparece meses depois. A mensagem trocada, não — a thread
    // já é o histórico dela (mesma escolha do chamado, decisão 20).
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Conversa",
      entidadeId: atual.id,
      descricao: `Conversa com ${atual.telefone}: ${atual.situacao} → ${nova}`,
    });

    return NextResponse.json(atualizada);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
