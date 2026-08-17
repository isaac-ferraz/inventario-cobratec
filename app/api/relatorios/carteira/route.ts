// GET /api/relatorios/carteira — o que vence e o que atrasou.
//
// Só AGREGADOS: contagem, valor, dia, faixa de atraso. Nome de devedor sai pela
// rota vizinha `/lista`, que tem portão próprio.
//
// Três papéis chegam aqui e um deles leva menos: a operadora de COBRANCA não
// recebe o recorte por operadora, e o corte é feito ANTES de virar JSON —
// esconder na tela deixaria o dado no payload, que é o defeito que a nota
// interna do chamado (decisão 20) existe para não repetir.
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirCarteira, podeVerOperadoras } from "@/lib/autorizacao";
import { configSiscobra } from "@/lib/siscobra";
import { hojeNoBrasil, resolverJanela, rotuloPeriodo } from "@/lib/relatorios";
import {
  ATRASO_DIAS,
  PRIMEIRA_PARCELA_DIAS,
  QUEBRAS_DIAS,
  aVencerEm,
  emAtrasoAte,
  primeiraParcelaDe,
  quebrasDe,
} from "@/lib/relatorios-carteira";

export const dynamic = "force-dynamic";

/** Número inteiro positivo ou nulo — "todas" chega como ausente ou "todas". */
function codigo(v: string | null): number | null | undefined {
  if (!v || v === "todas" || v === "todos") return null;
  if (!/^\d{1,9}$/.test(v)) return undefined;
  return Number(v);
}

export async function GET(req: Request) {
  const auth = await exigirCarteira(req);
  if ("resposta" in auth) return auth.resposta;

  if (!configSiscobra()) {
    return erro(
      "Carteira indisponível: a conexão com o Siscobra não está configurada (DB_HOST/DB_USER/DB_NAME).",
      503,
    );
  }

  const url = new URL(req.url);
  const hoje = hojeNoBrasil();
  const janela = resolverJanela(
    {
      janela: url.searchParams.get("janela"),
      inicio: url.searchParams.get("inicio"),
      fim: url.searchParams.get("fim"),
    },
    hoje,
  );
  if (!janela.ok) return erro(janela.erro);

  const carteira = codigo(url.searchParams.get("carteira"));
  const equipe = codigo(url.searchParams.get("equipe"));
  if (carteira === undefined || equipe === undefined) {
    return erro("Filtro de carteira ou equipe inválido.");
  }

  const recorte = { carteira, equipe };

  try {
    // Em paralelo: quatro varreduras independentes. Em fila, a tela esperaria a
    // soma das quatro — e a de atraso é a cara (180 dias de parcela cruzados
    // com as baixas).
    const [aVencer, atraso, quebras, primeira] = await Promise.all([
      aVencerEm({ ...recorte, inicio: janela.inicio, fim: janela.fim }, hoje),
      emAtrasoAte(recorte, hoje),
      quebrasDe(recorte, hoje),
      primeiraParcelaDe(recorte, hoje),
    ]);

    // O corte por papel. `delete` e não um segundo tipo: a forma da resposta é a
    // mesma, o que muda é o que ela carrega — e a tela já trata lista ausente.
    if (!podeVerOperadoras(auth.usuario.papel)) {
      aVencer.porOperadora = [];
      atraso.porOperadora = [];
      quebras.porOperadora = [];
    }

    return NextResponse.json({
      janela: {
        inicio: janela.inicio,
        fim: janela.fim,
        rotulo: rotuloPeriodo(janela.inicio, janela.fim, hoje),
      },
      hoje,
      aVencer,
      atraso,
      quebras,
      primeira,
      // A tela escreve estas janelas no rodapé de cada bloco. Vêm do servidor
      // para não existirem duas verdades sobre o mesmo número.
      janelas: {
        atrasoDias: ATRASO_DIAS,
        quebrasDias: QUEBRAS_DIAS,
        primeiraDias: PRIMEIRA_PARCELA_DIAS,
      },
      podeVerOperadoras: podeVerOperadoras(auth.usuario.papel),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    console.error("[relatorios] carteira:", msg);
    if (/statement timeout|canceling statement/i.test(msg)) {
      return erro(
        "A consulta demorou demais no CRM. Tente uma janela menor ou filtre por carteira.",
        504,
      );
    }
    return erro("Não foi possível consultar o Siscobra agora.", 502);
  }
}
