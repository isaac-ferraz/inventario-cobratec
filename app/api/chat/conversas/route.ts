import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirChat } from "@/lib/autorizacao";
import { ehSituacao, SITUACOES_ABERTAS } from "@/lib/conversas";

// GET /api/chat/conversas — a fila de atendimento.
//
// Não é paginada, e é decisão (decisão 22): a fila de um escritório de cobrança
// tem dezenas de conversas abertas, não milhares — e paginar uma fila esconde
// justamente o que a pessoa precisa ver de relance. O histórico encerrado, esse
// sim cresce sem teto, e por isso só vem quando pedido explicitamente.
const TETO_ENCERRADAS = 200;

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const url = new URL(req.url);
  const situacao = url.searchParams.get("situacao");
  const busca = (url.searchParams.get("busca") ?? "").trim();
  const minhas = url.searchParams.get("minhas") === "1";

  const where: Record<string, unknown> = {};

  if (situacao && ehSituacao(situacao)) {
    where.situacao = situacao;
  } else {
    // Sem filtro, a fila mostra o que está vivo. Encerradas só a pedido.
    where.situacao = { in: SITUACOES_ABERTAS };
  }

  if (minhas) where.responsavelId = auth.usuario.id;

  if (busca) {
    // O telefone é guardado só com dígitos, então buscar "99765-4321" precisa
    // procurar por "997654321" — senão a busca nunca acha o que a operadora
    // copiou da tela.
    const digitos = busca.replace(/\D/g, "");
    where.OR = [
      { nome: { contains: busca } },
      { carteira: { contains: busca } },
      ...(digitos ? [{ telefone: { contains: digitos } }] : []),
    ];
  }

  const conversas = await prisma.conversa.findMany({
    where,
    orderBy: { ultimaMensagemEm: "desc" },
    take: situacao === "encerrada" ? TETO_ENCERRADAS : undefined,
    select: {
      id: true,
      telefone: true,
      nome: true,
      carteira: true,
      situacao: true,
      motivoEscalonamento: true,
      siscobraDevcod: true,
      identificadaEm: true,
      ultimaMensagemEm: true,
      criadoEm: true,
      responsavel: { select: { id: true, nome: true, login: true } },
      // A última fala, para a fila mostrar do que se trata sem abrir.
      mensagens: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { autor: true, corpo: true, criadoEm: true },
      },
    },
  });

  // Contadores do conjunto INTEIRO, não da lista devolvida — mesma regra dos
  // KPIs paginados (decisão 22): número de tela nunca sai do que foi carregado.
  const porSituacao = await prisma.conversa.groupBy({
    by: ["situacao"],
    _count: { _all: true },
  });

  return NextResponse.json({
    conversas: conversas.map(({ mensagens, ...c }) => ({
      ...c,
      ultimaMensagem: mensagens[0] ?? null,
    })),
    totais: Object.fromEntries(
      porSituacao.map((g) => [g.situacao, g._count._all]),
    ),
  });
}
