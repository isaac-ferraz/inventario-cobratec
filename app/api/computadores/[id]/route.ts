import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { computadorSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { expandirComponentes } from "@/lib/especificacoes";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const computador = await prisma.computador.findUnique({
    where: { id: params.id },
    include: {
      funcionario: true,
      componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
    },
  });
  if (!computador) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json({
    ...computador,
    componentes: expandirComponentes(computador.componentes),
  });
}

// PATCH cobre edição de dados E mover de funcionário (basta enviar funcionarioId).
// `esperaAtualizadoEm` (opcional) habilita concorrência otimista: o cliente
// envia o `atualizadoEm` que carregou; se o registro mudou nesse meio-tempo,
// devolvemos 409 em vez de sobrescrever a alteração de outra pessoa.
export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(
    req,
    computadorSchema.partial().extend({
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
    const atual = await prisma.computador.findUnique({
      where: { id: params.id },
      select: { atualizadoEm: true },
    });
    if (!atual) return erro("Registro não encontrado.", 404);
    if (atual.atualizadoEm.toISOString() !== esperaAtualizadoEm) {
      return erro(
        "Este computador foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver os dados atuais antes de salvar.",
        409,
      );
    }
  }

  try {
    const atualizado = await prisma.computador.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// Remove o computador (componentes vão em cascata pela relação).
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await prisma.computador.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
