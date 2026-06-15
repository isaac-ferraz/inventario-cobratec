import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { componenteUpdateSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { serializar, expandirComponente } from "@/lib/especificacoes";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(req, componenteUpdateSchema);
  if ("resposta" in r) return r.resposta;

  const data: Record<string, unknown> = {};
  if (r.data.tipoId !== undefined) data.tipoId = r.data.tipoId;
  if (r.data.descricao !== undefined) data.descricao = r.data.descricao;
  if (r.data.especificacoes !== undefined) {
    data.especificacoes = serializar(r.data.especificacoes);
  }

  try {
    const atualizado = await prisma.componente.update({
      where: { id: params.id },
      data,
      include: { tipo: true },
    });
    return NextResponse.json(expandirComponente(atualizado));
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await prisma.componente.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
