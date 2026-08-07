import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { celularSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin, exigirEscopo } from "@/lib/autorizacao";
import { filtroCelular } from "@/lib/supervisao";

// GET /api/celulares?funcionarioId=...&cargo=...
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const url = new URL(req.url);
  const funcionarioId = url.searchParams.get("funcionarioId");
  const cargo = url.searchParams.get("cargo");

  const where: Record<string, unknown> = {};
  if (funcionarioId === "sem") {
    where.funcionarioId = null;
  } else if (funcionarioId) {
    where.funcionarioId = funcionarioId;
  }
  // Filtrar por cargo só faz sentido quando há funcionário; com "sem" o
  // aparelho não tem dono (nem cargo), então o filtro de cargo é ignorado.
  if (cargo && funcionarioId !== "sem") {
    where.funcionario = { cargo };
  }

  // O celular não tem sala: o recorte do supervisor vem pelo dono (decisão 15).
  const escopo = filtroCelular(auth.escopo);
  const celulares = await prisma.celular.findMany({
    where: escopo ? { AND: [where, escopo] } : where,
    include: { funcionario: true },
    orderBy: { identificador: "asc" },
  });
  return NextResponse.json(celulares);
}

// Cadastrar aparelho novo é entrada de patrimônio — segue só com o TI.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, celularSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.celular.create({
      data: {
        identificador: r.data.identificador,
        apelido: r.data.apelido,
        numero: r.data.numero,
        operadora: r.data.operadora,
        imei: r.data.imei,
        situacao: r.data.situacao,
        dataAquisicao: r.data.dataAquisicao,
        notaFiscal: r.data.notaFiscal,
        garantiaAte: r.data.garantiaAte,
        valorCompra: r.data.valorCompra,
        observacoes: r.data.observacoes,
        funcionarioId: r.data.funcionarioId || null,
      },
    });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Celular",
      entidadeId: criado.id,
      descricao: `Celular "${criado.identificador}" criado`,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
