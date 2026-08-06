import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { salaSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

// GET /api/salas?ativas=1
// `ativas=1` devolve só as salas ativas (usado pelos seletores dos formulários);
// sem o parâmetro devolve todas (tela de catálogo).
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const where = url.searchParams.get("ativas") === "1" ? { ativa: true } : {};

  const salas = await prisma.sala.findMany({
    where,
    include: { _count: { select: { computadores: true, funcionarios: true } } },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json(salas);
}

export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, salaSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criada = await prisma.sala.create({ data: r.data });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Sala",
      entidadeId: criada.id,
      descricao: `Sala "${criada.nome}" criada`,
    });
    return NextResponse.json(criada, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
