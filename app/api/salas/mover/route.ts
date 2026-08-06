import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moverParaSalaSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";

// POST /api/salas/mover
// Um endpoint só cobre os três gestos da tela da sala: trazer para cá, tirar
// daqui (destinoSalaId = null) e mandar para outra sala — item a item ou em
// lote. Rota estática: tem precedência sobre /api/salas/[id] no App Router.
export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, moverParaSalaSchema);
  if ("resposta" in r) return r.resposta;

  const { destinoSalaId } = r.data;
  const computadorIds = r.data.computadorIds ?? [];
  const funcionarioIds = r.data.funcionarioIds ?? [];

  // Destino precisa existir (id inválido viraria FK quebrada ou 500 obscuro).
  let destinoNome = "estoque sem sala";
  if (destinoSalaId) {
    const destino = await prisma.sala.findUnique({
      where: { id: destinoSalaId },
      select: { nome: true },
    });
    if (!destino) return erro("Sala de destino não encontrada.", 404);
    destinoNome = `"${destino.nome}"`;
  }

  // Estado ANTES do update, para a auditoria registrar origem → destino.
  const [computadoresAntes, funcionariosAntes] = await Promise.all([
    computadorIds.length
      ? prisma.computador.findMany({
          where: { id: { in: computadorIds } },
          select: { id: true, identificador: true, sala: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    funcionarioIds.length
      ? prisma.funcionario.findMany({
          where: { id: { in: funcionarioIds } },
          select: { id: true, nome: true, sala: { select: { nome: true } } },
        })
      : Promise.resolve([]),
  ]);

  try {
    // Atômico: ou tudo muda de sala, ou nada muda.
    const [pcs, funcs] = await prisma.$transaction([
      prisma.computador.updateMany({
        where: { id: { in: computadorIds } },
        data: { salaId: destinoSalaId },
      }),
      prisma.funcionario.updateMany({
        where: { id: { in: funcionarioIds } },
        data: { salaId: destinoSalaId },
      }),
    ]);

    // Auditoria best-effort, um evento por item movido (fora da transação).
    for (const c of computadoresAntes) {
      const origem = c.sala?.nome ? `"${c.sala.nome}"` : "estoque sem sala";
      await registrarAuditoria(req, {
        acao: "mover",
        entidade: "Computador",
        entidadeId: c.id,
        descricao: `Computador "${c.identificador}" movido de ${origem} para ${destinoNome}`,
      });
    }
    for (const f of funcionariosAntes) {
      const origem = f.sala?.nome ? `"${f.sala.nome}"` : "sem sala";
      await registrarAuditoria(req, {
        acao: "mover",
        entidade: "Funcionario",
        entidadeId: f.id,
        descricao: `Funcionário "${f.nome}" movido de ${origem} para ${destinoNome}`,
      });
    }

    return NextResponse.json({
      ok: true,
      computadores: pcs.count,
      funcionarios: funcs.count,
    });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
