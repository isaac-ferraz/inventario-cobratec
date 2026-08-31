// GET /api/relatorios/cobranca/filtros — o que preenche os três seletores.
//
// Rota própria (e não um pedaço do relatório) porque a vida das duas coisas é
// diferente: os números mudam a cada acordo fechado; a lista de equipes e
// carteiras muda quando alguém cadastra uma carteira. Juntas, cada troca de
// filtro pagaria de novo a consulta de 2,6s das carteiras.
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirRelatorio } from "@/lib/autorizacao";
import { configSiscobra } from "@/lib/siscobra";
import { carteiras, equipes, operadoras } from "@/lib/relatorios-cobranca";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await exigirRelatorio(req);
  if ("resposta" in auth) return auth.resposta;

  if (!configSiscobra()) {
    return erro(
      "Relatório indisponível: a conexão com o Siscobra não está configurada (DB_HOST/DB_USER/DB_NAME).",
      503,
    );
  }

  try {
    const [listaEquipes, listaCarteiras, listaOperadoras] = await Promise.all([
      equipes(),
      carteiras(),
      operadoras(),
    ]);
    return NextResponse.json({
      equipes: listaEquipes,
      carteiras: listaCarteiras,
      operadoras: listaOperadoras,
    });
  } catch (e) {
    console.error("[relatorios] filtros:", (e as Error).message);
    return erro("Não foi possível carregar equipes e carteiras.", 502);
  }
}
