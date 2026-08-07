import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manutencaoSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import { registrarAuditoria } from "@/lib/auditoria";
import { situacaoAoAbrirManutencao } from "@/lib/ativos";
import { lerPaginacao, montarPagina } from "@/lib/paginacao";

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

// GET /api/manutencoes?situacao=abertas|concluidas&equipamento=<id>
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const url = new URL(req.url);
  const situacao = url.searchParams.get("situacao");
  const equipamento = url.searchParams.get("equipamento");

  const where: Record<string, unknown> = {};
  if (situacao === "abertas") where.concluidaEm = null;
  if (situacao === "concluidas") where.concluidaEm = { not: null };
  if (equipamento) {
    where.OR = [{ computadorId: equipamento }, { celularId: equipamento }];
  }

  const p = lerPaginacao(url.searchParams);
  // O resumo é do conjunto FILTRADO INTEIRO, não da página: "custo somado" que
  // contasse só o que está na tela seria um número errado com cara de certo.
  const [manutencoes, total, emAberto, custo] = await Promise.all([
    prisma.manutencao.findMany({
      where,
      select: CAMPOS,
      // Em aberto primeiro (é a fila de trabalho), depois as mais recentes.
      orderBy: [{ concluidaEm: "asc" }, { abertaEm: "desc" }],
      skip: p.pular,
      take: p.limite,
    }),
    prisma.manutencao.count({ where }),
    prisma.manutencao.count({ where: { ...where, concluidaEm: null } }),
    prisma.manutencao.aggregate({ where, _sum: { custo: true } }),
  ]);
  return NextResponse.json({
    ...montarPagina(manutencoes, total, p),
    resumo: { emAberto, custoTotal: custo._sum.custo ?? 0 },
  });
}

// POST /api/manutencoes — mandar um equipamento para conserto.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, manutencaoSchema);
  if ("resposta" in r) return r.resposta;

  const computadorId = r.data.computadorId || null;
  const celularId = r.data.celularId || null;

  try {
    // Abrir manutenção muda a SITUAÇÃO do equipamento junto — as duas coisas
    // andam juntas ou nenhuma, senão sobra registro sem efeito (ou o contrário).
    const criada = await prisma.$transaction(async (tx) => {
      const equipamento = computadorId
        ? await tx.computador.findUnique({
            where: { id: computadorId },
            select: { identificador: true, situacao: true },
          })
        : await tx.celular.findUnique({
            where: { id: celularId! },
            select: { identificador: true, situacao: true },
          });
      if (!equipamento) throw new Error("EQUIPAMENTO_NAO_ENCONTRADO");

      const nova = await tx.manutencao.create({
        data: {
          computadorId,
          celularId,
          tipo: r.data.tipo,
          descricao: r.data.descricao,
          fornecedor: r.data.fornecedor,
          custo: r.data.custo,
          chamadoId: r.data.chamadoId || null,
          observacoes: r.data.observacoes,
          concluidaEm: r.data.concluidaEm ?? null,
        },
        select: CAMPOS,
      });

      // Manutenção já nascida concluída (registro retroativo) não mexe na
      // situação atual do equipamento.
      if (!nova.concluidaEm) {
        const novaSituacao = situacaoAoAbrirManutencao(equipamento.situacao);
        if (novaSituacao) {
          if (computadorId) {
            await tx.computador.update({
              where: { id: computadorId },
              data: { situacao: novaSituacao },
            });
          } else {
            await tx.celular.update({
              where: { id: celularId! },
              data: { situacao: novaSituacao },
            });
          }
        }
      }
      return { nova, rotulo: equipamento.identificador };
    });

    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Manutencao",
      entidadeId: criada.nova.id,
      descricao: `Manutenção ${r.data.tipo} aberta para "${criada.rotulo}"`,
    });

    return NextResponse.json(criada.nova, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "EQUIPAMENTO_NAO_ENCONTRADO") {
      return erro("Equipamento não encontrado.", 404);
    }
    return tratarErroPrisma(e);
  }
}
