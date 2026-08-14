// GET /api/relatorios/carteira/filtros — as listas dos seletores.
//
// Existe separada da gêmea em `/api/relatorios/cobranca/filtros` por causa do
// PORTÃO, não do conteúdo: a de lá é `exigirRelatorio` (admin e supervisor), e a
// operadora de cobrança precisa dos mesmos seletores para usar a carteira. O
// middleware libera para ela `/api/relatorios/carteira`, e não `/relatorios`
// inteiro — então a rota precisa morar debaixo deste caminho.
//
// As funções são as mesmas, com o mesmo cache de uma hora: nenhuma consulta a
// mais bate no CRM por esta rota existir.
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirCarteira } from "@/lib/autorizacao";
import { configSiscobra } from "@/lib/siscobra";
import { carteiras, equipes } from "@/lib/relatorios-cobranca";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await exigirCarteira(req);
  if ("resposta" in auth) return auth.resposta;

  if (!configSiscobra()) {
    return erro("Conexão com o Siscobra não configurada.", 503);
  }

  try {
    const [listaEquipes, listaCarteiras] = await Promise.all([
      equipes(),
      carteiras(),
    ]);
    return NextResponse.json({
      equipes: listaEquipes,
      carteiras: listaCarteiras,
    });
  } catch (e) {
    console.error("[relatorios] carteira/filtros:", (e as Error).message);
    return erro("Não foi possível carregar as listas do Siscobra.", 502);
  }
}
