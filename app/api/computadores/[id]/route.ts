import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computadorSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
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
export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(req, computadorSchema.partial());
  if ("resposta" in r) return r.resposta;

  const data: Record<string, unknown> = { ...r.data };
  // funcionarioId vazio ("") significa "sem funcionário" (null)
  if ("funcionarioId" in data) {
    data.funcionarioId = data.funcionarioId || null;
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
