// Filtro de lista que aceita mais de um valor (decisão 39), do lado do cliente.
//
// ──────────────── por que não é o mesmo de `relatorios-filtros.ts` ────────────────
//
// O dos relatórios lê CÓDIGOS NUMÉRICOS de um CRM externo e os entrega a um
// `= ANY` de Postgres; ele precisa recusar entrada torta, porque o outro lado é
// um banco de produção. Este lê IDs de texto (cuid) e sentinelas do próprio app
// e filtra um array já carregado em memória. Recusar aqui não protege nada, e
// deixaria a lista vazia sem explicação quando um link antigo trouxesse um id
// que já foi apagado.
//
// A diferença que importa está nas SENTINELAS. Os filtros do inventário não são
// só uma lista de ids: `?funcionario=sem` significa "os que não têm dono", e
// `?sala=sem` significa "os que ninguém colocou em lugar nenhum" — que são as
// duas perguntas que o Dashboard mais manda para a lista. Elas coexistem com os
// ids na mesma seleção: `?sala=sem,abc123` é "sem sala OU na sala X", e é um
// recorte legítimo (o que falta arrumar, mais o que já está no lugar certo).

/** O que uma chave de filtro significa depois de lida. */
export type Selecao = {
  /** Sem filtro nenhum — o padrão da chave. */
  todos: boolean;
  /** A sentinela "sem" (sem dono, sem sala...). */
  sem: boolean;
  /** A sentinela "com" (qualquer dono) — só o filtro de funcionário a usa. */
  com: boolean;
  /** Os ids escolhidos, sem as sentinelas. */
  ids: Set<string>;
};

const SENTINELA_SEM = "sem";
const SENTINELA_COM = "com";

/**
 * Lê o valor da URL.
 *
 * Aceita a string crua ("sem,a1") ou a lista que o `useFiltroLista` devolve —
 * as duas formas existem porque o hook é do cliente e algumas telas são
 * Server Components, que leem `searchParams` direto.
 *
 * @param valor  o que veio da query string ("todos", "sem", "a,b", ["sem","a"])
 * @param padrao o que significa "sem filtro" nesta chave ("todos" ou "todas")
 */
export function lerSelecao(valor: string | string[], padrao: string): Selecao {
  const partes = (Array.isArray(valor) ? valor : (valor ?? "").split(","))
    .map((p) => p.trim())
    .filter(Boolean);

  // "todos" no meio da lista vence tudo: quem marcou "todas as salas" junto com
  // duas salas quis todas. Sem esta regra o filtro ficaria mais restritivo do
  // que a última coisa que a pessoa clicou.
  if (partes.length === 0 || partes.includes(padrao)) {
    return { todos: true, sem: false, com: false, ids: new Set() };
  }

  const ids = new Set<string>();
  let sem = false;
  let com = false;
  for (const p of partes) {
    if (p === SENTINELA_SEM) sem = true;
    else if (p === SENTINELA_COM) com = true;
    else ids.add(p);
  }
  return { todos: false, sem, com, ids };
}

/**
 * O item passa pelo filtro?
 *
 * `id` nulo significa "não tem" — sem dono, sem sala. Ele só passa quando a
 * sentinela `sem` foi escolhida; é o que faz `?sala=abc` não trazer as máquinas
 * sem sala nenhuma junto.
 */
export function combina(sel: Selecao, id: string | null | undefined): boolean {
  if (sel.todos) return true;
  if (id === null || id === undefined || id === "") return sel.sem;
  if (sel.com) return true;
  return sel.ids.has(id);
}

/**
 * A versão para campos sem sentinela — cargo, situação, tipo, garantia.
 *
 * São valores de texto que existem sempre; "não tem cargo" não é um caso.
 */
export function combinaValor(sel: Selecao, valor: string | null | undefined): boolean {
  if (sel.todos) return true;
  if (valor === null || valor === undefined || valor === "") return sel.sem;
  return sel.ids.has(valor);
}

/**
 * O item tem ALGUM dos valores escolhidos?
 *
 * Para o filtro por tipo de componente, onde um computador tem vários: com dois
 * tipos marcados, a máquina entra se tiver qualquer um dos dois — que é o que
 * "mostre os que têm SSD ou placa de vídeo" quer dizer.
 */
export function combinaAlgum(sel: Selecao, valores: string[]): boolean {
  if (sel.todos) return true;
  if (valores.length === 0) return sel.sem;
  return valores.some((v) => sel.ids.has(v));
}

/**
 * Recorta a escolha da pessoa pelo que o papel dela alcança.
 *
 * ─────────────────────────── isto não é conveniência ───────────────────────────
 *
 * O supervisor de sala (decisão 24) só enxerga as salas dele, e o escopo vem do
 * servidor. Se o filtro escolhido fosse aplicado por UNIÃO, digitar `?sala=` com
 * o id de outra sala na barra de endereços ampliaria o alcance — escalada de
 * privilégio por query string.
 *
 * Então é INTERSEÇÃO, sempre: o escopo é teto, e o filtro só recorta dentro
 * dele. Pedir uma sala fora do escopo devolve conjunto vazio, e é o certo.
 *
 * `permitidos = null` significa "sem teto" (admin) — e aí a escolha passa
 * inteira.
 */
export function intersecaoDeEscopo(
  escolhidos: string[],
  permitidos: string[] | null,
): string[] {
  if (permitidos === null) return escolhidos;
  if (escolhidos.length === 0) return permitidos;
  const teto = new Set(permitidos);
  return escolhidos.filter((e) => teto.has(e));
}
