import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tipoComponenteSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin } from "@/lib/autorizacao";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const tipos = await prisma.tipoComponente.findMany({
    orderBy: { nome: "asc" },
    include: { _count: { select: { componentes: true } } },
  });
  return NextResponse.json(tipos);
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, tipoComponenteSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.tipoComponente.create({ data: r.data });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "TipoComponente",
      entidadeId: criado.id,
      descricao: `Tipo "${criado.nome}" criado`,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
