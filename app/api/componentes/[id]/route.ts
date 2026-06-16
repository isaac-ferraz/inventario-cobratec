import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { componenteUpdateSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { serializar, expandirComponente } from "@/lib/especificacoes";
import { registrarAuditoria } from "@/lib/auditoria";

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
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Componente",
      entidadeId: atualizado.id,
      descricao: `Componente "${atualizado.tipo.nome}: ${atualizado.descricao}" editado`,
    });
    return NextResponse.json(expandirComponente(atualizado));
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const removido = await prisma.componente.delete({
      where: { id: params.id },
      include: { tipo: true },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Componente",
      entidadeId: removido.id,
      descricao: `Componente "${removido.tipo.nome}: ${removido.descricao}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
