import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { celularSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria, type AcaoAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const celular = await prisma.celular.findUnique({
    where: { id: params.id },
    include: { funcionario: true },
  });
  if (!celular) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json(celular);
}

// PATCH cobre edição de dados E mover de funcionário (basta enviar funcionarioId).
// `esperaAtualizadoEm` (opcional) habilita concorrência otimista: o cliente
// envia o `atualizadoEm` que carregou; se o registro mudou nesse meio-tempo,
// devolvemos 409 em vez de sobrescrever a alteração de outra pessoa.
export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(
    req,
    celularSchema.partial().extend({
      esperaAtualizadoEm: z.string().optional(),
    }),
  );
  if ("resposta" in r) return r.resposta;

  const { esperaAtualizadoEm, ...campos } = r.data;
  const data: Record<string, unknown> = { ...campos };
  // funcionarioId vazio ("") significa "sem funcionário" (null)
  if ("funcionarioId" in data) {
    data.funcionarioId = data.funcionarioId || null;
  }

  if (esperaAtualizadoEm) {
    const atual = await prisma.celular.findUnique({
      where: { id: params.id },
      select: { atualizadoEm: true },
    });
    if (!atual) return erro("Registro não encontrado.", 404);
    if (atual.atualizadoEm.toISOString() !== esperaAtualizadoEm) {
      return erro(
        "Este celular foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver os dados atuais antes de salvar.",
        409,
      );
    }
  }

  // Para auditoria: se o funcionário mudou, a ação é "mover" e montamos a
  // descrição com origem → destino (nome do dono anterior e do novo).
  let acao: AcaoAuditoria = "editar";
  let trechoMover: string | null = null;
  if ("funcionarioId" in data) {
    const novoId = (data.funcionarioId as string | null) ?? null;
    const antes = await prisma.celular.findUnique({
      where: { id: params.id },
      select: { funcionarioId: true, funcionario: { select: { nome: true } } },
    });
    if (antes && antes.funcionarioId !== novoId) {
      acao = "mover";
      const origem = antes.funcionario?.nome
        ? `"${antes.funcionario.nome}"`
        : "estoque";
      let destino = "estoque";
      if (novoId) {
        const novo = await prisma.funcionario.findUnique({
          where: { id: novoId },
          select: { nome: true },
        });
        destino = novo?.nome ? `"${novo.nome}"` : "estoque";
      }
      trechoMover = `movido de ${origem} para ${destino}`;
    }
  }

  try {
    const atualizado = await prisma.celular.update({
      where: { id: params.id },
      data,
    });
    await registrarAuditoria(req, {
      acao,
      entidade: "Celular",
      entidadeId: atualizado.id,
      descricao: `Celular "${atualizado.identificador}" ${
        trechoMover ?? "atualizado"
      }`,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const removido = await prisma.celular.delete({
      where: { id: params.id },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Celular",
      entidadeId: removido.id,
      descricao: `Celular "${removido.identificador}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
