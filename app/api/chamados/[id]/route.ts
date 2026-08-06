import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chamadoUpdateSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirSessao } from "@/lib/autorizacao";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  calcularResolvidoEm,
  camposProibidos,
  filtrarMensagens,
  podeMudarStatus,
  podeVerChamado,
  ROTULO_STATUS,
  type Status,
} from "@/lib/chamados";

type Params = { params: { id: string } };

const DETALHE = {
  id: true,
  numero: true,
  titulo: true,
  descricao: true,
  categoria: true,
  prioridade: true,
  status: true,
  criadoEm: true,
  atualizadoEm: true,
  resolvidoEm: true,
  solicitanteId: true,
  solicitante: {
    select: {
      id: true,
      nome: true,
      login: true,
      funcionario: { select: { nome: true, cargo: true } },
    },
  },
  responsavel: { select: { id: true, nome: true, login: true } },
  computador: { select: { id: true, identificador: true, apelido: true } },
  celular: { select: { id: true, identificador: true, apelido: true, numero: true } },
  sala: { select: { id: true, nome: true } },
  mensagens: {
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      corpo: true,
      interna: true,
      criadoEm: true,
      autor: { select: { id: true, nome: true, login: true, papel: true } },
    },
  },
} as const;

export async function GET(req: Request, { params }: Params) {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const chamado = await prisma.chamado.findUnique({
    where: { id: params.id },
    select: DETALHE,
  });
  if (!chamado) return erro("Chamado não encontrado.", 404);

  if (
    !podeVerChamado(auth.usuario.papel, auth.usuario.id, chamado.solicitanteId)
  ) {
    // 404 e não 403: para quem não é dono, o chamado alheio simplesmente não
    // existe — um 403 confirmaria que aquele número é de alguém.
    return erro("Chamado não encontrado.", 404);
  }

  return NextResponse.json({
    ...chamado,
    // As notas internas são removidas ANTES de virar JSON.
    mensagens: filtrarMensagens(auth.usuario.papel, chamado.mensagens),
  });
}

// PATCH — andamento do chamado. O que cada papel pode fazer está em
// lib/chamados.ts (podeMudarStatus / camposProibidos).
export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, chamadoUpdateSchema);
  if ("resposta" in r) return r.resposta;

  const atual = await prisma.chamado.findUnique({
    where: { id: params.id },
    select: {
      numero: true,
      status: true,
      solicitanteId: true,
      resolvidoEm: true,
      responsavelId: true,
    },
  });
  if (!atual) return erro("Chamado não encontrado.", 404);

  if (!podeVerChamado(auth.usuario.papel, auth.usuario.id, atual.solicitanteId)) {
    return erro("Chamado não encontrado.", 404);
  }

  const proibidos = camposProibidos(auth.usuario.papel, r.data);
  if (proibidos.length > 0) {
    return erro(
      `Estes campos são do TI e não podem ser alterados por você: ${proibidos.join(", ")}.`,
      403,
    );
  }

  if (r.data.status) {
    const veredito = podeMudarStatus(
      auth.usuario.papel,
      atual.status,
      r.data.status,
    );
    if (!veredito.permitido) return erro(veredito.motivo, 403);
  }

  const dados: Record<string, unknown> = {};
  if (r.data.status) {
    dados.status = r.data.status;
    dados.resolvidoEm = calcularResolvidoEm(
      r.data.status,
      atual.resolvidoEm,
      new Date(),
    );
  }
  if (r.data.prioridade) dados.prioridade = r.data.prioridade;
  if ("categoria" in r.data) dados.categoria = r.data.categoria;
  if ("responsavelId" in r.data) dados.responsavelId = r.data.responsavelId || null;

  if (Object.keys(dados).length === 0) {
    return erro("Nada para atualizar.", 400);
  }

  try {
    const atualizado = await prisma.chamado.update({
      where: { id: params.id },
      data: dados,
      select: { id: true, numero: true, titulo: true, status: true },
    });

    // Descrição legível do que mudou — é o que aparece na tela de auditoria.
    const mudancas: string[] = [];
    if (r.data.status && r.data.status !== atual.status) {
      mudancas.push(
        `${ROTULO_STATUS[atual.status as Status]} → ${ROTULO_STATUS[r.data.status as Status]}`,
      );
    }
    if (r.data.prioridade) mudancas.push(`prioridade ${r.data.prioridade}`);
    if ("responsavelId" in r.data && r.data.responsavelId !== atual.responsavelId) {
      mudancas.push(r.data.responsavelId ? "responsável definido" : "devolvido à fila");
    }

    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Chamado",
      entidadeId: atualizado.id,
      descricao: `Chamado #${atualizado.numero} atualizado${
        mudancas.length ? ` (${mudancas.join(", ")})` : ""
      }`,
    });

    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
