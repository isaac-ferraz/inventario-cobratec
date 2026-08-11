import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { itemDepositoSchema, LIMITE_QUANTIDADE } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin } from "@/lib/autorizacao";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const item = await prisma.itemDeposito.findUnique({
    where: { id: params.id },
  });
  if (!item) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }
  return NextResponse.json(item);
}

// PATCH cobre dois casos:
//  1) Edição completa (dialog): campos do item — registra auditoria.
//  2) Ajuste rápido de quantidade pelos botões ± : envia só `delta` (ex: +1/-1).
//     É atômico (increment) e NÃO gera auditoria — a contagem do dia a dia
//     emitiria eventos demais. O total nunca fica negativo (piso em 0).
//     O delta respeita o MESMO teto da edição pelo formulário: antes ele não
//     tinha limite nenhum, e um `delta` gordo (digitado ou repetido por um botão
//     preso) gravava um estoque absurdo que a criação do item jamais aceitaria.
const patchSchema = itemDepositoSchema.partial().extend({
  delta: z.coerce
    .number({ invalid_type_error: "Ajuste deve ser um número" })
    .int("Ajuste deve ser um número inteiro")
    .min(-LIMITE_QUANTIDADE, "Ajuste fora do limite")
    .max(LIMITE_QUANTIDADE, "Ajuste fora do limite")
    .optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, patchSchema);
  if ("resposta" in r) return r.resposta;

  const { delta, ...campos } = r.data;

  // Ajuste rápido de quantidade (botões + / −).
  if (delta !== undefined) {
    const atual = await prisma.itemDeposito.findUnique({
      where: { id: params.id },
      select: { quantidade: true },
    });
    if (!atual) return erro("Registro não encontrado.", 404);
    // Piso em 0 e teto no mesmo limite da edição — o estoque nunca fica
    // negativo nem vira um número que não cabe numa caixa.
    const nova = Math.min(
      LIMITE_QUANTIDADE,
      Math.max(0, atual.quantidade + delta),
    );
    try {
      const atualizado = await prisma.itemDeposito.update({
        where: { id: params.id },
        data: { quantidade: nova },
      });
      return NextResponse.json(atualizado);
    } catch (e) {
      return tratarErroPrisma(e);
    }
  }

  // Edição completa pelo formulário.
  try {
    const atualizado = await prisma.itemDeposito.update({
      where: { id: params.id },
      data: campos,
    });
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "ItemDeposito",
      entidadeId: atualizado.id,
      descricao: `Item de depósito "${atualizado.nome}" editado (${atualizado.quantidade} un.)`,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const removido = await prisma.itemDeposito.delete({
      where: { id: params.id },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "ItemDeposito",
      entidadeId: removido.id,
      descricao: `Item de depósito "${removido.nome}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
