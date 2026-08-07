import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin, exigirEscopo } from "@/lib/autorizacao";
import { filtroFuncionario } from "@/lib/supervisao";

// GET /api/funcionarios?salaId=...  ("sem" = sem sala definida)
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const salaId = new URL(req.url).searchParams.get("salaId");

  const where: Record<string, unknown> = {};
  if (salaId === "sem") {
    where.salaId = null;
  } else if (salaId) {
    where.salaId = salaId;
  }

  const escopo = filtroFuncionario(auth.escopo);
  const funcionarios = await prisma.funcionario.findMany({
    where: escopo ? { AND: [where, escopo] } : where,
    orderBy: { nome: "asc" },
    include: {
      sala: true,
      _count: { select: { computadores: true, celulares: true } },
    },
  });
  return NextResponse.json(funcionarios);
}

// Cadastrar pessoa é do TI: quem entra na empresa não é decisão da sala.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
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
