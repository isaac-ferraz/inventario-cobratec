import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

// GET /api/funcionarios?salaId=...  ("sem" = sem sala definida)
export async function GET(req: Request): Promise<NextResponse> {
  const salaId = new URL(req.url).searchParams.get("salaId");

  const where: Record<string, unknown> = {};
  if (salaId === "sem") {
    where.salaId = null;
  } else if (salaId) {
    where.salaId = salaId;
  }

  const funcionarios = await prisma.funcionario.findMany({
    where,
    orderBy: { nome: "asc" },
    include: {
      sala: true,
      _count: { select: { computadores: true, celulares: true } },
    },
  });
  return NextResponse.json(funcionarios);
}

export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, funcionarioSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.funcionario.create({ data: r.data });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Funcionario",
      entidadeId: criado.id,
      descricao: `Funcionário "${criado.nome}" (${criado.cargo}) criado`,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
