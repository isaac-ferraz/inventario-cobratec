// Contrato compartilhado entre o Dashboard (Server Component) e os cards
// (Client Components).
//
// POR QUE ESTE ARQUIVO EXISTE: um módulo marcado com "use client" não exporta
// valores utilizáveis pelo servidor — o bundler troca cada export por uma
// referência-proxy do cliente. Uma constante importada de lá chega ao servidor
// como algo que não é número: `slice(0, LIMITE)` virava `slice(0, NaN)` e
// devolvia lista vazia, com o total certo ao lado. Constantes compartilhadas
// precisam morar num módulo neutro como este.

export type ItemDetalhe = {
  id: string;
  titulo: string;
  subtitulo?: string | null;
  /** Chip à direita: cargo, status do chamado, sala… */
  etiqueta?: string | null;
  /** Para onde este item leva. Sem href, a linha é só leitura. */
  href?: string;
};

/** Teto do que vai no pop-up: acima disso, a tela completa serve melhor. */
export const LIMITE_DETALHE = 30;

/** Dados que todo indicador carrega para conseguir abrir o detalhe. */
export type Detalhe = {
  itens: ItemDetalhe[];
  total: number;
  href: string;
  descricao?: string;
};

export type Tom = "neutro" | "alerta" | "ok" | "apagado";

export type Barra = {
  label: string;
  valor: number;
  detalhe: Detalhe;
};
