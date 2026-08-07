import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chamadoMensagemSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirSessao } from "@/lib/autorizacao";
import { alcancaChamado } from "@/lib/supervisao";
import { escopoDe } from "@/lib/sessao-servidor";

type Params = { params: { id: string } };

// POST /api/chamados/[id]/mensagens — responder no chamado.
//
// As mensagens NÃO geram evento de auditoria: a própria thread já é o histórico
// (com autor e data), e duplicar isso encheria a auditoria de ruído.
export async function POST(req: Request, { params }: Params) {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, chamadoMensagemSchema);
  if ("resposta" in r) return r.resposta;

  const chamado = await prisma.chamado.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, solicitanteId: true },
  });
  if (!chamado) return erro("Chamado não encontrado.", 404);

  if (!alcancaChamado(escopoDe(auth.usuario), chamado)) {
    return erro("Chamado não encontrado.", 404);
  }

  // Nota interna é ferramenta do TI. Se um operador mandar `interna: true`, o
  // campo é simplesmente ignorado — a mensagem entra como pública, que é o que
  // ele podia fazer de qualquer forma.
  const interna = auth.usuario.papel === "ADMIN" && r.data.interna === true;

  try {
    const mensagem = await prisma.chamadoMensagem.create({
      data: {
        chamadoId: chamado.id,
        autorId: auth.usuario.id,
        corpo: r.data.corpo,
        interna,
      },
      select: {
        id: true,
        corpo: true,
        interna: true,
        criadoEm: true,
        autor: { select: { id: true, nome: true, login: true, papel: true } },
      },
    });

    // Responder mexe no chamado: o `atualizadoEm` precisa refletir isso para a
    // lista ordenar por atividade recente. Nota interna não conta como resposta
    // ao solicitante, mas ainda é atividade no chamado.
    await prisma.chamado.update({
      where: { id: chamado.id },
      data: { atualizadoEm: new Date() },
    });

    return NextResponse.json(mensagem, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
