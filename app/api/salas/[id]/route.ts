import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { salaSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

// GET /api/salas/[id] — a sala e tudo que foi levado para ela.
// Devolve as duas listas cruas (computadores da sala e funcionários da sala); a
// tela compõe os "postos de trabalho" a partir delas, porque um computador pode
// estar nesta sala com o dono sentado em outra (e vice-versa).
export async function GET(_req: Request, { params }: Params) {
  const sala = await prisma.sala.findUnique({ where: { id: params.id } });
  if (!sala) {
    return NextResponse.json({ erro: "Sala não encontrada" }, { status: 404 });
  }

  const [computadores, funcionarios] = await Promise.all([
    prisma.computador.findMany({
      where: { salaId: params.id },
      include: {
        funcionario: { include: { sala: true } },
        componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
      },
      orderBy: { identificador: "asc" },
    }),
    prisma.funcionario.findMany({
      where: { salaId: params.id },
      include: {
        computadores: { include: { sala: true }, orderBy: { identificador: "asc" } },
        celulares: { orderBy: { identificador: "asc" } },
      },
      orderBy: { nome: "asc" },
    }),
  ]);

  return NextResponse.json({ sala, computadores, funcionarios });
}

export async function PATCH(req: Request, { params }: Params) {
  const r = await validarCorpo(req, salaSchema.partial());
  if ("resposta" in r) return r.resposta;
  try {
    const atualizada = await prisma.sala.update({
      where: { id: params.id },
      data: r.data,
    });
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Sala",
      entidadeId: atualizada.id,
      descricao: `Sala "${atualizada.nome}" editada${
        r.data.ativa === false ? " (desativada)" : ""
      }`,
    });
    return NextResponse.json(atualizada);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// Não deixa remover sala em uso — o vínculo é do computador/funcionário e
// removê-la silenciosamente apagaria a localização de todos eles. Para tirar a
// sala de circulação sem perder o histórico, use "desativar" (ativa = false).
export async function DELETE(req: Request, { params }: Params) {
  const [computadores, funcionarios] = await Promise.all([
    prisma.computador.count({ where: { salaId: params.id } }),
    prisma.funcionario.count({ where: { salaId: params.id } }),
  ]);
  const emUso = computadores + funcionarios;
  if (emUso > 0) {
    return erro(
      `Esta sala está em uso por ${computadores} computador(es) e ${funcionarios} funcionário(s). Mova-os para outra sala ou desative esta sala em vez de removê-la.`,
      409,
    );
  }
  try {
    const removida = await prisma.sala.delete({ where: { id: params.id } });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Sala",
      entidadeId: removida.id,
      descricao: `Sala "${removida.nome}" removida`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
