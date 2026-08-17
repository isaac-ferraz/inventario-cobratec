// GET /api/avisos — o que o relógio produziu.
// POST /api/avisos — marca tudo como lido.
//
// Portão `exigirRelatorio` (admin e supervisor), o mesmo dos relatórios de
// cobrança, e pelo mesmo motivo: o que um aviso carrega são números agregados
// da operação e contagens de purga. Nenhum deles tem devedor dentro — o texto
// da purga é montado por `resumoPurga`, que grava contagens e nunca telefone.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirRelatorio } from "@/lib/autorizacao";
import { registrarAuditoria } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

/** Teto da tela. Avisos velhos saem pela purga, não por paginação. */
const LIMITE = 100;

export async function GET(req: Request) {
  const auth = await exigirRelatorio(req);
  if ("resposta" in auth) return auth.resposta;

  const [avisos, pendentes] = await Promise.all([
    prisma.aviso.findMany({
      orderBy: { criadoEm: "desc" },
      take: LIMITE,
      select: {
        id: true,
        tipo: true,
        nivel: true,
        titulo: true,
        corpo: true,
        link: true,
        entrega: true,
        lidoEm: true,
        criadoEm: true,
      },
    }),
    prisma.aviso.count({ where: { lidoEm: null } }),
  ]);

  // As tarefas entram junto: a pergunta "por que não chegou o fechamento de
  // ontem?" se responde olhando se a tarefa rodou, e não procurando o aviso que
  // não existe. Sem isto, uma tarefa quebrada é invisível — que é exatamente o
  // defeito que este módulo veio corrigir.
  const tarefas = await prisma.tarefaAgendada.findMany({
    orderBy: { nome: "asc" },
    select: {
      nome: true,
      ultimoDia: true,
      ultimaExecucao: true,
      ultimoResultado: true,
      ultimoDetalhe: true,
      duracaoMs: true,
    },
  });

  return NextResponse.json({ avisos, pendentes, tarefas });
}

export async function POST(req: Request) {
  const auth = await exigirRelatorio(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await prisma.aviso.updateMany({
    where: { lidoEm: null },
    data: { lidoEm: new Date() },
  });

  // Sem auditoria: marcar como lido não muda dado nenhum do inventário, e um
  // evento por clique afogaria a trilha — mesma razão do ajuste ± do depósito.
  return NextResponse.json({ ok: true, marcados: r.count });
}

// DELETE /api/avisos — limpa os já lidos.
export async function DELETE(req: Request) {
  const auth = await exigirRelatorio(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await prisma.aviso.deleteMany({ where: { lidoEm: { not: null } } });
  if (r.count > 0) {
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Aviso",
      descricao: `${r.count} aviso(s) lido(s) removido(s)`,
    });
  }
  return NextResponse.json({ ok: true, removidos: r.count });
}
