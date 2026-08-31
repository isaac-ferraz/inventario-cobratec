// A BASE da carteira: quantas fichas e quanto de saldo existe para cobrar.
//
// ─────────────────── a regra veio da decisão 40, não daqui ───────────────────
//
// A decisão 40 reproduziu o `RELATÓRIO ANALÍTICO DA CARTEIRA` que o próprio
// Siscobra imprime (147 páginas, 143 carteiras) e bateu em **142 de 143** — em
// fichas e em valor. A única divergência foi uma ficha alterada 14 minutos
// depois de o PDF ser impresso. Aquela conferência ficou registrada no projeto
// irmão e nunca virou código aqui; este arquivo é ela virando código.
//
// A regra NÃO é a óbvia, pelo padrão de sempre deste CRM:
//
//   • O universo é **`contrato.convalsal > 0`** em carteira com `carati = 1`.
//     O `carati` é o que separa as 143 do relatório das 19 que ficam de fora,
//     com 100% de limpeza.
//   • Valor é **`sum(convalsal)`**. NÃO é `devedor.devsal`: aquilo é cache e
//     erra por centavos — a quarta vez que a coluna de nome óbvio é a errada
//     neste banco, depois de `acovalatu`, `retusucod` e
//     `comissao_operadores.usucod`.
//   • Ficha é **`count(DISTINCT devcod)`**, não `count(*)`: um devedor pode ter
//     vários contratos, e o relatório oficial conta pessoas.
//
// ─────────────────────── o que foi medido para escrever isto ───────────────────
//
// Em 27/08/2026, contra o CRM:
//
//   • `conati` é REDUNDANTE aqui. Onde `convalsal > 0`, não existe contrato com
//     `conati <> 0` — 0 em 55.720 linhas numa amostra de dez carteiras. Por isso
//     a cláusula não entra: filtro que não filtra é só uma coisa a mais para
//     alguém manter errado depois. (`lib/siscobra.ts` usa `conati = 0` no dossiê
//     porque lá o universo é outro.)
//   • `devcod` NÃO se repete entre carteiras — nenhum devcod aparece em mais de
//     um `carcod`. É o que torna `count(DISTINCT devcod)` correto também na
//     linha de total, e não só por carteira.
//
// ─────────────────────────────── a fronteira ───────────────────────────────
//
// A mesma dos três módulos irmãos: só agregado. Nenhum nome, CPF, telefone ou
// contrato de devedor sai daqui — `devcod` é contado e nunca devolvido.
import { consultaRelatorio } from "@/lib/siscobra";
import { TIMEOUT_TELA, type Fatia } from "@/lib/relatorios-cobranca";

export type BaseCarteira = {
  /** Devedores distintos com contrato em aberto — a "ficha" do relatório oficial. */
  fichas: number;
  /** Contratos em aberto (um devedor pode ter mais de um). */
  contratos: number;
  /** Saldo a cobrar, `sum(convalsal)`. */
  saldo: number;
  /**
   * Devedores CADASTRADOS na carteira, com ou sem saldo.
   *
   * Não faz parte da regra conferida da decisão 40 — está aqui porque numa
   * carteira recém-carregada a diferença entre os dois números é a informação:
   * a Rede Drogal entrou com 103 devedores e 5 fichas com contrato em aberto.
   * Um número só faria a carga parecer maior ou menor do que é.
   */
  cadastrados: number;
  /** `chave` = carcod, `qtd` = fichas, `valor` = saldo. */
  porCarteira: Fatia[];
};

export type CarteiraIdentificada = { cod: number; nome: string; ativa: boolean };

const SEM_CARTEIRA = "(sem carteira)";

// $1 carteiras (null = todas)
//
// GROUPING SETS pelo mesmo motivo dos módulos irmãos: total e quebra por
// carteira saem de uma varredura só. Aqui ela é barata, mas a forma é a mesma
// para quem vier ler os quatro arquivos em sequência.
const SQL_BASE = `
WITH base AS (
  SELECT c.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom,
         c.devcod, c.convalsal
    FROM contrato c
    JOIN carteira ca ON ca.carcod = c.carcod
   WHERE c.convalsal > 0
     AND ca.carati = 1
     AND ($1::int[] IS NULL OR c.carcod = ANY($1::int[]))
)
SELECT CASE WHEN grouping(carcod) = 0 THEN 'carteira' ELSE 'total' END AS eixo,
       CASE WHEN grouping(carcod) = 0 THEN carcod END::int AS chave,
       CASE WHEN grouping(carcod) = 0 THEN carnom END AS rotulo,
       count(*)::int              AS contratos,
       count(DISTINCT devcod)::int AS fichas,
       COALESCE(sum(convalsal), 0)::float8 AS saldo
  FROM base
 GROUP BY GROUPING SETS ((carcod, carnom), ())`;

// Contado à parte, e não por LEFT JOIN na consulta acima: juntar `devedor` a
// `contrato` multiplicaria as linhas e estragaria `sum(convalsal)` — o tipo de
// erro que soma certo em carteira pequena e explode em carteira grande.
const SQL_CADASTRADOS = `
SELECT count(*)::int AS cadastrados
  FROM devedor d
 WHERE ($1::int[] IS NULL OR d.carcod = ANY($1::int[]))`;

type LinhaBase = {
  eixo: string;
  chave: number | null;
  rotulo: string | null;
  contratos: number;
  fichas: number;
  saldo: number;
};

export async function baseDaCarteira(
  carteiras: number[] | null,
  timeoutMs = TIMEOUT_TELA,
): Promise<BaseCarteira> {
  const [linhas, cad] = await Promise.all([
    consultaRelatorio<LinhaBase>(SQL_BASE, [carteiras], timeoutMs),
    consultaRelatorio<{ cadastrados: number }>(SQL_CADASTRADOS, [carteiras], timeoutMs),
  ]);

  const total = linhas.find((l) => l.eixo === "total");
  return {
    fichas: total?.fichas ?? 0,
    contratos: total?.contratos ?? 0,
    saldo: total?.saldo ?? 0,
    cadastrados: cad[0]?.cadastrados ?? 0,
    porCarteira: linhas
      .filter((l) => l.eixo === "carteira")
      .map((l) => ({
        chave: l.chave,
        rotulo: l.rotulo?.trim() || SEM_CARTEIRA,
        qtd: l.fichas,
        valor: l.saldo,
      }))
      .sort((a, b) => b.valor - a.valor || b.qtd - a.qtd),
  };
}

/**
 * O nome de uma carteira pelo código — direto da tabela.
 *
 * `carteiras()` em `lib/relatorios-cobranca.ts` não serve para isto: ela só
 * lista quem teve ACORDO nos últimos 12 meses, que é o corte certo para um
 * seletor e o errado para resolver um nome. Uma carteira recém-carregada não
 * está lá, e o recorte sairia rotulado "código 1163" na aba Parâmetros — que é
 * exatamente o número sem dono que a aba existe para evitar.
 *
 * Devolve também `ativa` (`carati = 1`), porque a consulta da base exige carteira
 * ativa: sem esse aviso, uma carteira desativada devolveria zero e o zero se
 * leria como "não há nada para cobrar".
 */
export async function carteirasPorCodigo(
  cods: number[],
  timeoutMs = 10_000,
): Promise<CarteiraIdentificada[]> {
  if (cods.length === 0) return [];
  const linhas = await consultaRelatorio<{
    cod: number;
    nome: string | null;
    ativa: boolean;
  }>(
    `SELECT c.carcod::int AS cod,
            COALESCE(c.carnom, c.carnomabr) AS nome,
            (c.carati = 1) AS ativa
       FROM carteira c
      WHERE c.carcod = ANY($1::int[])
      ORDER BY c.carcod`,
    [cods],
    timeoutMs,
  );
  return linhas.map((l) => ({
    cod: l.cod,
    nome: l.nome?.trim() || `Carteira ${l.cod}`,
    ativa: l.ativa === true,
  }));
}
