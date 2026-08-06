import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tipoComponenteSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin } from "@/lib/autorizacao";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, tipoComponenteSchema.partial());
  if ("resposta" in r) return r.resposta;
  try {
    const atualizado = await prisma.tipoComponente.update({
      where: { id: params.id },
      data: r.data,
    });
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "TipoComponente",
      entidadeId: atualizado.id,
      descricao: `Tipo "${atualizado.nome}" editado`,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// Não deixa remover tipo em uso (evita componentes órfãos).
export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const emUso = await prisma.componente.count({ where: { tipoId: params.id } });
  if (emUso > 0) {
    return erro(
      `Este tipo está em uso por ${emUso} componente(s). Remova ou troque o tipo desses componentes primeiro.`,
      409,
    );
  }
  try {
    const removido = await prisma.tipoComponente.delete({
      where: { id: params.id },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "TipoComponente",
      entidadeId: removido.id,
      descricao: `Tipo "${removido.nome}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
