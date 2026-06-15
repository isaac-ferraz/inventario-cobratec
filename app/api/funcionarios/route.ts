import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";

export async function GET(): Promise<NextResponse> {
  const funcionarios = await prisma.funcionario.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { computadores: true } } },
  });
  return NextResponse.json(funcionarios);
}

export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, funcionarioSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.funcionario.create({ data: r.data });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
