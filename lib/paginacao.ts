// Paginação das listas que crescem sem teto.
//
// QUAIS LISTAS: chamados, manutenções e auditoria acumulam para sempre — um ano
// de operação são milhares de linhas, e mandar tudo de uma vez trava a tela.
// Computadores, celulares e funcionários NÃO são paginados de propósito: o teto
// deles é o tamanho do escritório (dezenas), e os filtros dessas telas rodam no
// cliente. Paginá-las obrigaria a mover busca e filtro para o servidor sem
// ganho real. Ver decisão 22 em docs/decisoes.md.
//
// POR QUE OFFSET E NÃO CURSOR: `chamados` ordena por (status, criadoEm), que
// não é único nem estável para cursor. Com dezenas de páginas no pior caso, o
// custo de `skip` em SQLite é irrelevante — e a regra fica compreensível.

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

export type Paginacao = {
  limite: number;
  pagina: number;
  /** Quantos registros pular — o que vai direto no `skip` do Prisma. */
  pular: number;
};

/**
 * Lê `limite` e `pagina` da query string, tolerando lixo: valor ausente,
 * negativo, zero, texto ou acima do teto cai no padrão/limite, nunca em erro.
 * Uma lista quebrar porque alguém digitou `?pagina=abc` na barra seria pior do
 * que simplesmente mostrar a primeira página.
 */
export function lerPaginacao(params: URLSearchParams): Paginacao {
  const limiteBruto = Number(params.get("limite"));
  const limite =
    Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(Math.floor(limiteBruto), LIMITE_MAXIMO)
      : LIMITE_PADRAO;

  const paginaBruta = Number(params.get("pagina"));
  const pagina =
    Number.isFinite(paginaBruta) && paginaBruta > 1 ? Math.floor(paginaBruta) : 1;

  return { limite, pagina, pular: (pagina - 1) * limite };
}

export type Pagina<T> = {
  itens: T[];
  total: number;
  pagina: number;
  limite: number;
  /** Se há mais coisa depois desta página — é o que liga o botão da tela. */
  temMais: boolean;
};

export function montarPagina<T>(
  itens: T[],
  total: number,
  p: Paginacao,
): Pagina<T> {
  return {
    itens,
    total,
    pagina: p.pagina,
    limite: p.limite,
    temMais: p.pular + itens.length < total,
  };
}
