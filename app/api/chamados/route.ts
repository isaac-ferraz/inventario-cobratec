import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chamadoSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { exigirSessao } from "@/lib/autorizacao";
import { registrarAuditoria } from "@/lib/auditoria";
import { STATUS_ABERTOS } from "@/lib/chamados";
import { lerPaginacao, montarPagina } from "@/lib/paginacao";

// Resumo para a lista — sem o corpo das mensagens (que só o detalhe carrega).
const CAMPOS_LISTA = {
  id: true,
  numero: true,
  titulo: true,
  categoria: true,
  prioridade: true,
  status: true,
  criadoEm: true,
  atualizadoEm: true,
  resolvidoEm: true,
  solicitante: { select: { id: true, nome: true, login: true } },
  responsavel: { select: { id: true, nome: true, login: true } },
  computador: { select: { id: true, identificador: true, apelido: true } },
  celular: { select: { id: true, identificador: true, apelido: true } },
  sala: { select: { id: true, nome: true } },
  _count: { select: { mensagens: true } },
} as const;

// GET /api/chamados?status=...&prioridade=...&responsavelId=...
//
// ESCOPO POR PAPEL: o operador recebe SEMPRE só os chamados dele. Isso é
// aplicado no `where`, não na tela — não existe parâmetro capaz de fazer a
// consulta escapar disso.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const prioridade = url.searchParams.get("prioridade");
  const responsavelId = url.searchParams.get("responsavelId");

  const where: Record<string, unknown> = {};
  if (auth.usuario.papel !== "ADMIN") {
    where.solicitanteId = auth.usuario.id;
  }
  if (status === "abertos") {
    where.status = { in: STATUS_ABERTOS };
  } else if (status) {
    where.status = status;
  }
  if (prioridade) where.prioridade = prioridade;
  // Filtros de fila só fazem sentido para quem gerencia a fila.
  if (responsavelId && auth.usuario.papel === "ADMIN") {
    where.responsavelId = responsavelId === "sem" ? null : responsavelId;
  }

  const p = lerPaginacao(url.searchParams);
  const [chamados, total] = await Promise.all([
    prisma.chamado.findMany({
      where,
      select: CAMPOS_LISTA,
      orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
      skip: p.pular,
      take: p.limite,
    }),
    prisma.chamado.count({ where }),
  ]);
  return NextResponse.json(montarPagina(chamados, total, p));
}

// POST /api/chamados — abrir chamado (o gesto do operador).
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, chamadoSchema);
  if ("resposta" in r) return r.resposta;

  // Prioridade é decisão do TI: chamado nasce "normal" e o admin ajusta. Sem
  // isso, todo chamado chegaria "urgente".
  const prioridade =
    auth.usuario.papel === "ADMIN" ? (r.data.prioridade ?? "normal") : "normal";

  // A sala do chamado vem do funcionário vinculado ao usuário — o TI precisa
  // saber ONDE ir, e perguntar isso a cada chamado seria fricção desnecessária.
  let salaId: string | null = null;
  if (auth.usuario.funcionarioId) {
    const funcionario = await prisma.funcionario.findUnique({
      where: { id: auth.usuario.funcionarioId },
      select: { salaId: true },
    });
    salaId = funcionario?.salaId ?? null;
  }

  try {
    const criado = await prisma.$transaction(async (tx) => {
      // `numero` é sequencial e amigável. O SQLite só faz autoincrement na PK,
      // então calculamos aqui dentro da transação (escrita serializada).
      const ultimo = await tx.chamado.findFirst({
        orderBy: { numero: "desc" },
        select: { numero: true },
      });
      return tx.chamado.create({
        data: {
          numero: (ultimo?.numero ?? 0) + 1,
          titulo: r.data.titulo,
          descricao: r.data.descricao,
          categoria: r.data.categoria,
          prioridade,
          solicitanteId: auth.usuario.id,
          computadorId: r.data.computadorId || null,
          celularId: r.data.celularId || null,
          salaId,
        },
        select: CAMPOS_LISTA,
      });
    });

    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Chamado",
      entidadeId: criado.id,
      descricao: `Chamado #${criado.numero} "${criado.titulo}" aberto`,
    });

    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
