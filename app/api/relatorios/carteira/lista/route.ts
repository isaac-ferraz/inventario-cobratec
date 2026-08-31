// GET /api/relatorios/carteira/lista — de quem cobrar, com nome.
//
// A única rota do relatório que devolve dado de devedor. Por isso ela tem
// portão próprio (`exigirCarteiraNominal`: admin e cobrança, nunca supervisor)
// em vez de reusar o dos agregados — ver o comentário lá em lib/autorizacao.ts.
//
// O CPF já chega mascarado da consulta (lib/relatorios-carteira.ts), e o
// telefone não vem do CRM: quem o tem é o próprio app, na conversa do /chat, e
// é de lá que a tela oferece o "falar no WhatsApp".
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { MAX_CODIGOS, recorteDaUrl } from "@/lib/relatorios-filtros";
import { exigirCarteiraNominal, podeVerOperadoras } from "@/lib/autorizacao";
import { prisma } from "@/lib/prisma";
import { configSiscobra } from "@/lib/siscobra";
import { hojeNoBrasil, resolverJanela } from "@/lib/relatorios";
import { listarParcelas } from "@/lib/relatorios-carteira";

export const dynamic = "force-dynamic";

/** Teto de linhas. Ver `listarParcelas`: lista que ninguém lê é só exposição. */
const LIMITE = 300;

export async function GET(req: Request) {
  const auth = await exigirCarteiraNominal(req);
  if ("resposta" in auth) return auth.resposta;

  if (!configSiscobra()) {
    return erro("Lista indisponível: a conexão com o Siscobra não está configurada.", 503);
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

  // Um parser só para os três filtros (decisão 39). Recorte torto é 400: tratar
  // como "todas" mostraria mais do que a pessoa pediu, e calado.
  const recorte = recorteDaUrl(url.searchParams);
  if (!recorte) {
    return erro(
      `Filtro de carteira, equipe ou operadora inválido (no máximo ${MAX_CODIGOS} códigos, separados por vírgula).`,
    );
  }


  // ─── o filtro de operadora é, ele mesmo, um recorte nominal ───
  //
  // A decisão 36 nega à operadora de COBRANCA o ranking por operadora. Deixar
  // que ela FILTRE por operadora devolveria o mesmo dado pela porta dos fundos:
  // um pedido por vez, e ela reconstrói o ranking inteiro. O portão é aqui, no
  // servidor, e não em esconder o seletor — a query string é editável.
  if (recorte.operadoras && !podeVerOperadoras(auth.usuario.papel)) {
    return erro("Seu perfil não recorta a carteira por operadora.", 403);
  }
  try {
    const parcelas = await listarParcelas(
      { inicio: janela.inicio, fim: janela.fim, ...recorte },
      hoje,
      LIMITE,
    );

    // ─── o cruzamento que só este app consegue fazer ───
    //
    // O Siscobra sabe quem deve; o /chat sabe com quem já existe conversa aberta
    // no WhatsApp. Os dois bancos nunca se falam — o cruzamento é aqui, em
    // memória, por `devcod`, e é o que transforma a lista em ação: em vez de
    // "ligue para fulano", a linha vira um link para a conversa que já existe.
    //
    // Uma consulta só, com os devcod da página. Um `findFirst` por linha seriam
    // 300 idas ao SQLite para desenhar uma tabela.
    const devcods = [...new Set(parcelas.map((p) => p.devcod))];
    const conversas = devcods.length
      ? await prisma.conversa.findMany({
          where: { siscobraDevcod: { in: devcods }, situacao: { not: "encerrada" } },
          select: { id: true, siscobraDevcod: true, situacao: true },
        })
      : [];
    const porDevedor = new Map(
      conversas
        .filter((c): c is typeof c & { siscobraDevcod: number } =>
          c.siscobraDevcod !== null,
        )
        .map((c) => [c.siscobraDevcod, { id: c.id, situacao: c.situacao }]),
    );

    return NextResponse.json({
      parcelas: parcelas.map((p) => ({
        ...p,
        conversa: porDevedor.get(p.devcod) ?? null,
      })),
      limite: LIMITE,
      // A tela precisa dizer quando a lista foi cortada: uma tabela truncada em
      // silêncio parece uma carteira menor do que é.
      truncada: parcelas.length >= LIMITE,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    console.error("[relatorios] carteira/lista:", msg);
    if (/statement timeout|canceling statement/i.test(msg)) {
      return erro("A consulta demorou demais no CRM. Tente uma janela menor.", 504);
    }
    return erro("Não foi possível consultar o Siscobra agora.", 502);
  }
}
