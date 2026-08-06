import { NextResponse } from "next/server";
import { moverParaSalaSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { moverParaSala, rotuloDestino } from "@/lib/mover-sala";
import { exigirAdmin } from "@/lib/autorizacao";

// POST /api/salas/mover
// Um endpoint só cobre os três gestos da tela da sala: trazer para cá, tirar
// daqui (destinoSalaId = null) e mandar para outra sala — item a item ou em
// lote. Rota estática: tem precedência sobre /api/salas/[id] no App Router.
//
// A regra do conjunto (os computadores do funcionário vão junto com ele) vive
// em lib/mover-sala.ts, compartilhada com a edição do funcionário.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, moverParaSalaSchema);
  if ("resposta" in r) return r.resposta;

  const { destinoSalaId } = r.data;

  // Destino precisa existir (id inválido viraria FK quebrada ou 500 obscuro).
  const destinoNome = await rotuloDestino(destinoSalaId);
  if (!destinoNome) return erro("Sala de destino não encontrada.", 404);

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
