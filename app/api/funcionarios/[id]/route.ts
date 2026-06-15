import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(req, funcionarioSchema.partial());
  if ("resposta" in r) return r.resposta;
  try {
    const atualizado = await prisma.funcionario.update({
      where: { id: params.id },
      data: r.data,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// DELETE: por padrão bloqueia se houver computador. Use ?liberar=1 para
// soltar os computadores (funcionarioId = null) antes de remover.
export async function DELETE(req: Request, { params }: Params) {
  const url = new URL(req.url);
  const liberar = url.searchParams.get("liberar") === "1";

  const computadores = await prisma.computador.count({
    where: { funcionarioId: params.id },
  });

  if (computadores > 0 && !liberar) {
    return erro(
      `Funcionário possui ${computadores} computador(es). Confirme a liberação para "sem funcionário" antes de remover.`,
      409,
    );
  }

  try {
    // Liberar as máquinas e remover o funcionário de forma atômica (evita
    // estado intermediário se algo falhar entre os dois passos).
    await prisma.$transaction(async (tx) => {
      if (computadores > 0 && liberar) {
        await tx.computador.updateMany({
          where: { funcionarioId: params.id },
          data: { funcionarioId: null },
        });
      }
      await tx.funcionario.delete({ where: { id: params.id } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
