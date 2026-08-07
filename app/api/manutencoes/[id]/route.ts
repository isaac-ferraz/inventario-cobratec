import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manutencaoUpdateSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirEscopo, foraDoEscopo } from "@/lib/autorizacao";
import {
  alcancaCelular,
  alcancaComputador,
  type Escopo,
} from "@/lib/supervisao";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  situacaoAoAbrirManutencao,
  situacaoAoConcluirManutencao,
} from "@/lib/ativos";

type Params = { params: { id: string } };

// A manutenção alcança o supervisor pelo equipamento envolvido.
async function manutencaoNoEscopo(id: string, escopo: Escopo) {
  const m = await prisma.manutencao.findUnique({
    where: { id },
    select: {
      computador: {
        select: { salaId: true, funcionario: { select: { salaId: true } } },
      },
      celular: { select: { funcionario: { select: { salaId: true } } } },
    },
  });
  if (!m) return false;
  if (m.computador) return alcancaComputador(escopo, m.computador);
  if (m.celular) return alcancaCelular(escopo, m.celular);
  // Manutenção órfã (equipamento removido): só o TI mexe.
  return escopo.papel === "ADMIN";
}

const CAMPOS = {
  id: true,
  tipo: true,
  descricao: true,
  fornecedor: true,
  custo: true,
  abertaEm: true,
  concluidaEm: true,
  observacoes: true,
  computador: { select: { id: true, identificador: true, apelido: true } },
  celular: { select: { id: true, identificador: true, apelido: true } },
  chamado: { select: { id: true, numero: true, titulo: true } },
} as const;

export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  if (!(await manutencaoNoEscopo(params.id, auth.escopo))) {
    return foraDoEscopo("Manutenção");
  }

  const r = await validarCorpo(req, manutencaoUpdateSchema);
  if ("resposta" in r) return r.resposta;

  const atual = await prisma.manutencao.findUnique({
    where: { id: params.id },
    select: {
      concluidaEm: true,
      computadorId: true,
      celularId: true,
      computador: { select: { identificador: true, situacao: true } },
      celular: { select: { identificador: true, situacao: true } },
    },
  });
  if (!atual) return erro("Manutenção não encontrada.", 404);

  const dados: Record<string, unknown> = {};
  for (const campo of [
    "tipo",
    "descricao",
    "fornecedor",
    "custo",
    "observacoes",
  ] as const) {
    if (campo in r.data && r.data[campo] !== undefined) {
      dados[campo] = r.data[campo];
    }
  }
  if ("chamadoId" in r.data) dados.chamadoId = r.data.chamadoId || null;

  // Concluir/reabrir é o que mexe na situação do equipamento.
  const mexeNaConclusao = "concluidaEm" in r.data;
  const concluindo =
    mexeNaConclusao && !atual.concluidaEm && Boolean(r.data.concluidaEm);
  const reabrindo =
    mexeNaConclusao && Boolean(atual.concluidaEm) && !r.data.concluidaEm;
  if (mexeNaConclusao) dados.concluidaEm = r.data.concluidaEm ?? null;

  if (Object.keys(dados).length === 0) {
    return erro("Nada para atualizar.", 400);
  }

  const situacaoAtual =
    atual.computador?.situacao ?? atual.celular?.situacao ?? "ativo";
  const rotulo =
    atual.computador?.identificador ?? atual.celular?.identificador ?? "";

  try {
    const atualizada = await prisma.$transaction(async (tx) => {
      const m = await tx.manutencao.update({
        where: { id: params.id },
        data: dados,
        select: CAMPOS,
      });

      const novaSituacao = concluindo
        ? situacaoAoConcluirManutencao(situacaoAtual)
        : reabrindo
          ? situacaoAoAbrirManutencao(situacaoAtual)
          : null;

      if (novaSituacao) {
        if (atual.computadorId) {
          await tx.computador.update({
            where: { id: atual.computadorId },
            data: { situacao: novaSituacao },
          });
        } else if (atual.celularId) {
          await tx.celular.update({
            where: { id: atual.celularId },
            data: { situacao: novaSituacao },
          });
        }
      }
      return m;
    });

    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Manutencao",
      entidadeId: atualizada.id,
      descricao: `Manutenção de "${rotulo}" ${
        concluindo ? "concluída" : reabrindo ? "reaberta" : "editada"
      }`,
    });

    return NextResponse.json(atualizada);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  if (!(await manutencaoNoEscopo(params.id, auth.escopo))) {
    return foraDoEscopo("Manutenção");
  }

  const atual = await prisma.manutencao.findUnique({
    where: { id: params.id },
    select: {
      concluidaEm: true,
      computadorId: true,
      celularId: true,
      computador: { select: { identificador: true, situacao: true } },
      celular: { select: { identificador: true, situacao: true } },
    },
  });
  if (!atual) return erro("Manutenção não encontrada.", 404);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.manutencao.delete({ where: { id: params.id } });

      // Apagar uma manutenção EM ABERTO desfaz o efeito dela: o equipamento
      // não pode ficar preso em "manutencao" sem registro que explique.
      if (!atual.concluidaEm) {
        const situacao =
          atual.computador?.situacao ?? atual.celular?.situacao ?? "ativo";
        const volta = situacaoAoConcluirManutencao(situacao);
        if (volta) {
          if (atual.computadorId) {
            await tx.computador.update({
              where: { id: atual.computadorId },
              data: { situacao: volta },
            });
          } else if (atual.celularId) {
            await tx.celular.update({
              where: { id: atual.celularId },
              data: { situacao: volta },
            });
          }
        }
      }
    });

    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Manutencao",
      entidadeId: params.id,
      descricao: `Manutenção de "${
        atual.computador?.identificador ?? atual.celular?.identificador ?? ""
      }" removida`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
