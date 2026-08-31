// GET /api/relatorios/cobranca — os números da operação no período pedido.
//
// Os filtros vêm da query string (e não de um corpo POST) porque a tela os
// mantém na URL: assim o recorte que o gestor está vendo é um link que ele
// manda para o supervisor — o mesmo princípio da decisão 23.
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { MAX_CODIGOS, recorteDaUrl } from "@/lib/relatorios-filtros";
import { exigirRelatorio } from "@/lib/autorizacao";
import { configSiscobra } from "@/lib/siscobra";
import { hojeNoBrasil, resolverPeriodo, rotuloPeriodo } from "@/lib/relatorios";
import { acionamentosDe, acordosDo } from "@/lib/relatorios-cobranca";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await exigirRelatorio(req);
  if ("resposta" in auth) return auth.resposta;

  // 503 e não 500: "o CRM não está configurado aqui" é uma verdade que o TI
  // resolve mexendo no .env — um 500 o mandaria procurar bug no código.
  if (!configSiscobra()) {
    return erro(
      "Relatório indisponível: a conexão com o Siscobra não está configurada (DB_HOST/DB_USER/DB_NAME).",
      503,
    );
  }

  const url = new URL(req.url);
  const hoje = hojeNoBrasil();
  const periodo = resolverPeriodo(
    {
      periodo: url.searchParams.get("periodo"),
      inicio: url.searchParams.get("inicio"),
      fim: url.searchParams.get("fim"),
    },
    hoje,
  );
  if (!periodo.ok) return erro(periodo.erro);

  // Um parser só para os três filtros (decisão 39). Recorte torto é 400: tratar
  // como "todas" mostraria mais do que a pessoa pediu, e calado.
  const recorte = recorteDaUrl(url.searchParams);
  if (!recorte) {
    return erro(
      `Filtro de carteira, equipe ou operadora inválido (no máximo ${MAX_CODIGOS} códigos, separados por vírgula).`,
    );
  }

  const filtro = { inicio: periodo.inicio, fim: periodo.fim, ...recorte };

  try {
    // Em paralelo: são duas varreduras independentes, e a de acionamentos (55M
    // linhas) é a lenta — esperá-las em fila dobraria o tempo da tela à toa.
    const [acordos, acionamentos] = await Promise.all([
      acordosDo(filtro),
      acionamentosDe(filtro),
    ]);
    return NextResponse.json({
      periodo: {
        inicio: periodo.inicio,
        fim: periodo.fim,
        rotulo: rotuloPeriodo(periodo.inicio, periodo.fim, hoje),
      },
      acordos,
      acionamentos,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // Log sem filtro nenhum: aqui não passa dado de devedor, mas o hábito de
    // não despejar parâmetro em log de servidor é o da decisão 30.
    console.error("[relatorios] cobrança:", msg);
    if (/statement timeout|canceling statement/i.test(msg)) {
      return erro(
        "A consulta demorou demais no CRM. Tente um período menor ou filtre por equipe.",
        504,
      );
    }
    return erro("Não foi possível consultar o Siscobra agora.", 502);
  }
}
