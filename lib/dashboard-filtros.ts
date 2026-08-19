// Os filtros do Dashboard de Informática (decisão 39).
//
// ─────────────────────── por que o painel não tinha filtro ───────────────────────
//
// Até aqui os números do Dashboard eram sempre do parque inteiro, e o recorte
// acontecia DEPOIS: cada indicador é um link para a lista já filtrada (decisão
// 23). Isso resolve "quais são os sete sem licença" e não resolve "como está a
// Sala 93" — para essa pergunta a pessoa tinha de olhar o painel inteiro e
// descontar de cabeça.
//
// ──────────────────────── a regra que não pode escorregar ────────────────────────
//
// O supervisor de sala (decisão 24) já chega aqui com um recorte imposto pelo
// servidor (`filtroComputador` e irmãos em `lib/supervisao.ts`). O filtro que a
// pessoa escolhe compõe com ele por **AND**, nunca por OR.
//
// É a diferença entre um filtro e um buraco: com OR, o supervisor da Sala 1
// digitaria `?sala=<id da sala 9>` na barra de endereços e o painel obedeceria.
// Com AND, pedir uma sala fora do escopo devolve zero — que é a resposta certa.
//
// O AND é feito montando `{ AND: [escopo, escolha] }`, e não mesclando as duas
// chaves num objeto só: `filtroComputador` devolve um `OR` de duas condições, e
// espalhá-lo junto com outra chave `OR` faria uma sobrescrever a outra em
// silêncio.

import { lerSelecao, type Selecao } from "@/lib/filtros-multi";

/** As chaves que o painel entende. Reusadas pelo "limpar filtros". */
export const CHAVES_DASHBOARD = ["cargo", "sala", "situacao"] as const;

export type FiltroDashboard = {
  cargos: string[];
  salas: string[];
  situacoes: string[];
};

/** Um `searchParams` do Next, que pode trazer string, lista ou nada. */
export type ParamsBrutos = Record<string, string | string[] | undefined>;

function lista(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const bruto = Array.isArray(v) ? v.join(",") : v;
  return bruto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p !== "todos" && p !== "todas");
}

export function lerFiltroDashboard(params: ParamsBrutos): FiltroDashboard {
  return {
    cargos: lista(params.cargo),
    salas: lista(params.sala),
    situacoes: lista(params.situacao),
  };
}

export function temFiltro(f: FiltroDashboard): boolean {
  return f.cargos.length > 0 || f.salas.length > 0 || f.situacoes.length > 0;
}

/**
 * A escolha vira um fragmento de `where` do Prisma.
 *
 * A sentinela `sem` (sem sala definida) precisa de `salaId: null`, que não cabe
 * num `in` — por isso o `OR` entre os dois. Sem ele, "sem sala" seria procurar
 * uma sala chamada "sem" e devolveria zero em silêncio.
 */
function ondeSala(sel: Selecao, campo: "salaId" | "funcionario"): unknown | null {
  if (sel.todos) return null;
  const ids = [...sel.ids];
  const ramos: unknown[] = [];
  if (campo === "salaId") {
    if (ids.length) ramos.push({ salaId: { in: ids } });
    if (sel.sem) ramos.push({ salaId: null });
  } else {
    if (ids.length) ramos.push({ funcionario: { salaId: { in: ids } } });
    // "Sem sala" para o celular é o dono sem sala OU o aparelho sem dono: o
    // aparelho anda com a pessoa, então um celular em estoque também não está
    // em sala nenhuma.
    if (sel.sem) {
      ramos.push({ funcionario: { salaId: null } });
      ramos.push({ funcionarioId: null });
    }
  }
  if (ramos.length === 0) return null;
  return ramos.length === 1 ? ramos[0] : { OR: ramos };
}

/**
 * O `where` do computador: escopo do papel AND escolha da pessoa.
 *
 * `escopo` já vem de `filtroComputador(escopoDe(usuario))` — `undefined` para
 * admin, que não tem teto.
 */
export function ondeComputadorFiltrado(
  escopo: Record<string, unknown> | undefined,
  f: FiltroDashboard,
): Record<string, unknown> {
  const partes: unknown[] = [];
  if (escopo) partes.push(escopo);

  const selSala = lerSelecao(f.salas, "todos");
  const cond = ondeSala(selSala, "salaId");
  if (cond) partes.push(cond);

  if (f.cargos.length) {
    partes.push({ funcionario: { cargo: { in: f.cargos } } });
  }
  if (f.situacoes.length) {
    partes.push({ situacao: { in: f.situacoes } });
  }

  return partes.length ? { AND: partes } : {};
}

/**
 * O `where` do celular. A sala dele é a do DONO — o aparelho anda com a pessoa
 * (decisão 15), e por isso o campo é `funcionario.salaId` e não `salaId`.
 */
export function ondeCelularFiltrado(
  escopo: Record<string, unknown> | undefined,
  f: FiltroDashboard,
): Record<string, unknown> {
  const partes: unknown[] = [];
  if (escopo) partes.push(escopo);

  const cond = ondeSala(lerSelecao(f.salas, "todos"), "funcionario");
  if (cond) partes.push(cond);

  if (f.cargos.length) {
    partes.push({ funcionario: { cargo: { in: f.cargos } } });
  }
  if (f.situacoes.length) {
    partes.push({ situacao: { in: f.situacoes } });
  }

  return partes.length ? { AND: partes } : {};
}

/**
 * O `where` do chamado.
 *
 * Cargo e situação NÃO se aplicam: chamado não tem cargo nem situação de ativo
 * — o `status` dele é outra coisa. Recortar chamado por sala funciona (a sala
 * de quem abriu), e é o único dos três que faz sentido aqui.
 */
export function ondeChamadoFiltrado(
  escopo: Record<string, unknown> | undefined,
  f: FiltroDashboard,
): Record<string, unknown> {
  const partes: unknown[] = [];
  if (escopo) partes.push(escopo);
  if (f.salas.length) {
    const sel = lerSelecao(f.salas, "todos");
    const ids = [...sel.ids];
    const ramos: unknown[] = [];
    if (ids.length) ramos.push({ salaId: { in: ids } });
    if (sel.sem) ramos.push({ salaId: null });
    if (ramos.length) partes.push(ramos.length === 1 ? ramos[0] : { OR: ramos });
  }
  return partes.length ? { AND: partes } : {};
}

/**
 * O filtro corrente vira query string, para os links do painel o carregarem.
 *
 * Sem isto, clicar em "Sem licença Windows: 7" com a Sala 93 filtrada abriria a
 * lista com os sete da EMPRESA — o card e a lista discordariam, que é
 * exatamente o defeito que a decisão 23 resolveu.
 */
export function comoQuery(f: FiltroDashboard): string {
  const p = new URLSearchParams();
  if (f.cargos.length) p.set("cargo", f.cargos.join(","));
  if (f.salas.length) p.set("sala", f.salas.join(","));
  if (f.situacoes.length) p.set("situacao", f.situacoes.join(","));
  return p.toString();
}

/** Junta o filtro corrente a um link que já tem parâmetros próprios. */
export function comFiltro(href: string, f: FiltroDashboard): string {
  const extra = comoQuery(f);
  if (!extra) return href;
  return href.includes("?") ? `${href}&${extra}` : `${href}?${extra}`;
}
