import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { computadorSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { expandirComponentes } from "@/lib/especificacoes";
import { registrarAuditoria, type AcaoAuditoria } from "@/lib/auditoria";
import { exigirAdmin, exigirEscopo, foraDoEscopo } from "@/lib/autorizacao";
import { alcancaComputador, podeMover } from "@/lib/supervisao";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const computador = await prisma.computador.findUnique({
    where: { id: params.id },
    include: {
      funcionario: true,
      sala: true,
      componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
    },
  });
  if (!computador) {
    return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  }
  // Fora do escopo responde 404, não 403: um 403 confirmaria que aquele
  // patrimônio existe.
  if (!alcancaComputador(auth.escopo, computador)) {
    return foraDoEscopo("Computador");
  }
  return NextResponse.json({
    ...computador,
    componentes: expandirComponentes(computador.componentes),
  });
}

// PATCH cobre edição de dados E mover de funcionário (basta enviar funcionarioId).
// `esperaAtualizadoEm` (opcional) habilita concorrência otimista: o cliente
// envia o `atualizadoEm` que carregou; se o registro mudou nesse meio-tempo,
// devolvemos 409 em vez de sobrescrever a alteração de outra pessoa.
export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(
    req,
    computadorSchema.partial().extend({
      esperaAtualizadoEm: z.string().optional(),
    }),
  );
  if ("resposta" in r) return r.resposta;

  const { esperaAtualizadoEm, ...campos } = r.data;
  const data: Record<string, unknown> = { ...campos };
  // funcionarioId vazio ("") significa "sem funcionário" (null)
  if ("funcionarioId" in data) {
    data.funcionarioId = data.funcionarioId || null;
  }

  // Escopo do supervisor, antes de qualquer escrita.
  const antesDoEscopo = await prisma.computador.findUnique({
    where: { id: params.id },
    select: {
      salaId: true,
      funcionario: { select: { salaId: true } },
    },
  });
  if (!antesDoEscopo) return erro("Registro não encontrado.", 404);
  if (!alcancaComputador(auth.escopo, antesDoEscopo)) {
    return foraDoEscopo("Computador");
  }
  // Mudar de sala é mover: o destino também precisa ser dele, senão empurraria
  // a máquina para fora do próprio alcance.
  if ("salaId" in data) {
    const destino = (data.salaId as string | null) || null;
    if (
      destino !== antesDoEscopo.salaId &&
      !podeMover(auth.escopo, antesDoEscopo.salaId, destino)
    ) {
      return erro(
        "Você só pode mover equipamentos entre as salas pelas quais responde.",
        403,
      );
    }
  }

  if (esperaAtualizadoEm) {
    const atual = await prisma.computador.findUnique({
      where: { id: params.id },
      select: { atualizadoEm: true },
    });
    if (!atual) return erro("Registro não encontrado.", 404);
    if (atual.atualizadoEm.toISOString() !== esperaAtualizadoEm) {
      return erro(
        "Este computador foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver os dados atuais antes de salvar.",
        409,
      );
    }
  }

  // Para auditoria: se o funcionário mudou, a ação é "mover" e montamos a
  // descrição com origem → destino (nome do dono anterior e do novo).
  let acao: AcaoAuditoria = "editar";
  let trechoMover: string | null = null;
  if ("funcionarioId" in data) {
    const novoId = (data.funcionarioId as string | null) ?? null;
    const antes = await prisma.computador.findUnique({
      where: { id: params.id },
      select: { funcionarioId: true, funcionario: { select: { nome: true } } },
    });
    if (antes && antes.funcionarioId !== novoId) {
      acao = "mover";
      const origem = antes.funcionario?.nome
        ? `"${antes.funcionario.nome}"`
        : "estoque";
      let destino = "estoque";
      if (novoId) {
        const novo = await prisma.funcionario.findUnique({
          where: { id: novoId },
          select: { nome: true },
        });
        destino = novo?.nome ? `"${novo.nome}"` : "estoque";
      }
      trechoMover = `movido de ${origem} para ${destino}`;
    }
  }

  try {
    const atualizado = await prisma.computador.update({
      where: { id: params.id },
      data,
    });
    await registrarAuditoria(req, {
      acao,
      entidade: "Computador",
      entidadeId: atualizado.id,
      descricao: `Computador "${atualizado.identificador}" ${
        trechoMover ?? "atualizado"
      }`,
    });
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// Remove o computador (componentes vão em cascata pela relação).
export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const removido = await prisma.computador.delete({
      where: { id: params.id },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Computador",
      entidadeId: removido.id,
      descricao: `Computador "${removido.identificador}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
