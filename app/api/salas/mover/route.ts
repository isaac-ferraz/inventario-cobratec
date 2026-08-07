import { NextResponse } from "next/server";
import { moverParaSalaSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { moverParaSala, rotuloDestino } from "@/lib/mover-sala";
import { exigirEscopo } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { alcancaSala, ehSupervisor, podeMover } from "@/lib/supervisao";

// POST /api/salas/mover
// Um endpoint só cobre os três gestos da tela da sala: trazer para cá, tirar
// daqui (destinoSalaId = null) e mandar para outra sala — item a item ou em
// lote. Rota estática: tem precedência sobre /api/salas/[id] no App Router.
//
// A regra do conjunto (os computadores do funcionário vão junto com ele) vive
// em lib/mover-sala.ts, compartilhada com a edição do funcionário.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, moverParaSalaSchema);
  if ("resposta" in r) return r.resposta;

  const { destinoSalaId } = r.data;

  // Destino precisa existir (id inválido viraria FK quebrada ou 500 obscuro).
  const destinoNome = await rotuloDestino(destinoSalaId);
  if (!destinoNome) return erro("Sala de destino não encontrada.", 404);

  // Escopo do supervisor: cada item precisa SAIR de uma sala dele e CHEGAR em
  // outra sala dele. Conferimos a origem real no banco — confiar no que a tela
  // mandou permitiria forjar um id e arrastar equipamento de outra sala.
  if (ehSupervisor(auth.escopo)) {
    if (!alcancaSala(auth.escopo, destinoSalaId)) {
      return erro(
        "Você só pode mover para as salas pelas quais responde.",
        403,
      );
    }
    const [pcs, funcs] = await Promise.all([
      prisma.computador.findMany({
        where: { id: { in: r.data.computadorIds ?? [] } },
        select: { id: true, salaId: true },
      }),
      prisma.funcionario.findMany({
        where: { id: { in: r.data.funcionarioIds ?? [] } },
        select: { id: true, salaId: true },
      }),
    ]);
    const origens = [...pcs, ...funcs];
    const fora = origens.filter(
      (o) => !podeMover(auth.escopo, o.salaId, destinoSalaId),
    );
    if (fora.length > 0 || origens.length <
        (r.data.computadorIds?.length ?? 0) + (r.data.funcionarioIds?.length ?? 0)) {
      return erro(
        "Há itens fora das salas pelas quais você responde.",
        403,
      );
    }
  }

  try {
    const resultado = await moverParaSala({
      destinoSalaId,
      destinoNome,
      computadorIds: r.data.computadorIds,
      funcionarioIds: r.data.funcionarioIds,
    });

    // Auditoria best-effort, um evento por item movido (fora da transação).
    for (const e of resultado.eventos) {
      await registrarAuditoria(req, {
        acao: "mover",
        entidade: e.entidade,
        entidadeId: e.id,
        descricao: e.descricao,
      });
    }

    return NextResponse.json({
      ok: true,
      computadores: resultado.computadores,
      funcionarios: resultado.funcionarios,
    });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
