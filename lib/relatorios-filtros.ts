// Os filtros dos relatórios do CRM — a leitura da query string, em um lugar só.
//
// ─────────────────────────── por que este arquivo ───────────────────────────
//
// Até a decisão 39 cada filtro era uma escolha ÚNICA: uma carteira ou todas. Na
// operação isso não fecha — quem cuida das três carteiras do mesmo cedente
// somava três telas na mão. Agora a URL carrega uma lista (`?carteira=12,45,88`)
// e o SQL recebe um array.
//
// A função de parse já existia, e existia TRÊS VEZES: copiada byte a byte em
// `cobranca/route.ts`, `carteira/route.ts` e `carteira/lista/route.ts`. Duas
// cópias da mesma regra já divergiram uma vez neste projeto (a lista de papéis,
// decisão 25.1) e o preço foi um papel inalcançável na prática. Aqui ela é uma.
//
// ─────────────────────────────── o tri-estado ───────────────────────────────
//
// O retorno tem três valores e os três significam coisas diferentes:
//
//   • `null`      → sem filtro (todas). Vira `NULL` no SQL, e o `($n IS NULL OR
//                   ...)` deixa a linha passar.
//   • `number[]`  → o recorte pedido.
//   • `undefined` → entrada torta. A rota responde 400 em vez de tratar como
//                   "todas" — filtro que falha para o lado permissivo mostra
//                   mais do que a pessoa pediu, e ela não tem como perceber.
//
// É o mesmo contrato da `codigo()` antiga, para as rotas não precisarem mudar de
// forma; o que muda é o plural.

/**
 * Teto de códigos por filtro.
 *
 * Escolher as 191 carteiras já tem nome, e é `null` — a consulta sai sem
 * cláusula nenhuma e o banco agradece. O teto existe para o outro caso: a query
 * string é a superfície pública do relatório, e sem limite ela vira um jeito de
 * mandar um `IN` de dez mil itens contra um banco de PRODUÇÃO a partir da barra
 * de endereços.
 */
export const MAX_CODIGOS = 50;

/** O que a UI manda quando nada foi escolhido. Sai da URL pelo `useFiltroUrl`. */
const TODAS = new Set(["", "todas", "todos"]);

/**
 * Lê uma lista de códigos da query string.
 *
 * `"12,45,88"` → `[12, 45, 88]` · `"todas"`/vazio/ausente → `null` · qualquer
 * item torto → `undefined` (a rota devolve 400).
 *
 * Ordena e remove repetido de propósito: `?carteira=45,12` e `?carteira=12,45,12`
 * descrevem o mesmo recorte, e normalizar faz os dois chegarem ao banco como a
 * mesma consulta — mesmo plano, mesmo cache de plano.
 */
export function codigos(v: string | null | undefined): number[] | null | undefined {
  if (v === null || v === undefined) return null;
  const bruto = v.trim();
  if (TODAS.has(bruto.toLowerCase())) return null;

  const partes = bruto.split(",");
  // O teto é conferido ANTES do parse: recusar cedo evita percorrer uma lista
  // arbitrariamente longa só para concluir que ela é longa demais.
  if (partes.length > MAX_CODIGOS) return undefined;

  const vistos = new Set<number>();
  for (const parte of partes) {
    const item = parte.trim();
    // `\d{1,9}` e não `Number.isInteger`: o `Number()` do JS aceita "1e3",
    // " 12 ", "0x10" e "12.0", e nenhum deles é um código de carteira. O código
    // 0 também não existe no Siscobra — `carcod`/`usugrucod`/`usucod` começam
    // em 1 —, então zero é entrada torta, não filtro vazio.
    if (!/^\d{1,9}$/.test(item)) return undefined;
    const n = Number(item);
    if (n === 0) return undefined;
    vistos.add(n);
  }
  if (vistos.size === 0) return undefined;
  return [...vistos].sort((a, b) => a - b);
}

/**
 * Lê os três filtros de recorte de uma vez.
 *
 * Devolve `null` quando qualquer um deles está torto, para a rota poder responder
 * 400 com uma linha só. O nome do parâmetro na URL continua no SINGULAR
 * (`?carteira=`, `?equipe=`, `?operadora=`) mesmo aceitando lista: os links que
 * o Dashboard já espalhou pelo app continuam valendo, e um link antigo com um
 * código só é uma lista de um item.
 */
export function recorteDaUrl(
  params: URLSearchParams,
): { carteiras: number[] | null; equipes: number[] | null; operadoras: number[] | null } | null {
  const carteiras = codigos(params.get("carteira"));
  const equipes = codigos(params.get("equipe"));
  const operadoras = codigos(params.get("operadora"));
  if (carteiras === undefined || equipes === undefined || operadoras === undefined) {
    return null;
  }
  return { carteiras, equipes, operadoras };
}

/**
 * O caminho de volta: a lista vira query string.
 *
 * Usado pela tela ao montar o link do Excel e pelos testes. Lista vazia some do
 * parâmetro — é o mesmo contrato do `useFiltroUrl`, onde o valor padrão nunca
 * aparece na URL.
 */
export function paraQuery(codigos: number[] | string[] | null): string | null {
  if (!codigos || codigos.length === 0) return null;
  return codigos.join(",");
}
