import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { itemDepositoSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

// GET /api/deposito?categoria=...
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const categoria = url.searchParams.get("categoria");

  const itens = await prisma.itemDeposito.findMany({
    where: categoria ? { categoria } : {},
    // Em falta e estoque baixo primeiro ajudaria, mas a ordenação por nome é
    // mais previsível para a contagem; o destaque visual fica na tela.
    orderBy: [{ categoria: "asc" }, { nome: "asc" }],
  });
  return NextResponse.json(itens);
}

export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, itemDepositoSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.itemDeposito.create({
      data: {
        nome: r.data.nome,
        categoria: r.data.categoria,
        quantidade: r.data.quantidade ?? 0,
        quantidadeMinima: r.data.quantidadeMinima ?? 0,
        localizacao: r.data.localizacao,
        observacoes: r.data.observacoes,
      },
    });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "ItemDeposito",
      entidadeId: criado.id,
      descricao: `Item de depósito "${criado.nome}" criado (${criado.quantidade} un.)`,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
