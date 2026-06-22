import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(req, funcionarioSchema.partial());
  if ("resposta" in r) return r.resposta;
  try {
    const atualizado = await prisma.funcionario.update({
      where: { id: params.id },
      data: r.data,
    });
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Funcionario",
      entidadeId: atualizado.id,
      descricao: `Funcionário "${atualizado.nome}" editado${
        r.data.ativo === false ? " (inativado)" : ""
      }`,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// DELETE: por padrão bloqueia se houver computador ou celular vinculado. Use
// ?liberar=1 para soltar os aparelhos (funcionarioId = null) antes de remover.
export async function DELETE(req: Request, { params }: Params) {
  const url = new URL(req.url);
  const liberar = url.searchParams.get("liberar") === "1";

  const [computadores, celulares] = await Promise.all([
    prisma.computador.count({ where: { funcionarioId: params.id } }),
    prisma.celular.count({ where: { funcionarioId: params.id } }),
  ]);
  const vinculados = computadores + celulares;

  if (vinculados > 0 && !liberar) {
    return erro(
      `Funcionário possui ${computadores} computador(es) e ${celulares} celular(es). Confirme a liberação para "sem funcionário" antes de remover.`,
      409,
    );
  }

  try {
    // Liberar os aparelhos e remover o funcionário de forma atômica (evita
    // estado intermediário se algo falhar entre os passos).
    const removido = await prisma.$transaction(async (tx) => {
      if (vinculados > 0 && liberar) {
        await tx.computador.updateMany({
          where: { funcionarioId: params.id },
          data: { funcionarioId: null },
        });
        await tx.celular.updateMany({
          where: { funcionarioId: params.id },
          data: { funcionarioId: null },
        });
      }
      return tx.funcionario.delete({ where: { id: params.id } });
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Funcionario",
      entidadeId: removido.id,
      descricao: `Funcionário "${removido.nome}" removido${
        vinculados > 0
          ? ` (${computadores} computador(es) e ${celulares} celular(es) liberado(s))`
          : ""
      }`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
