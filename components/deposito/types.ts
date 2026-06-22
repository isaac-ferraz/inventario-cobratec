// Tipos da resposta da API usados pela tela de Depósito.

export type ItemDeposito = {
  id: string;
  nome: string;
  categoria: string | null;
  quantidade: number;
  quantidadeMinima: number;
  localizacao: string | null;
  observacoes: string | null;
  atualizadoEm: string;
};

// Situação de estoque derivada da quantidade vs. mínimo (para cor/badge).
export type Situacao = "falta" | "baixo" | "ok";

export function situacao(i: ItemDeposito): Situacao {
  if (i.quantidade <= 0) return "falta";
  if (i.quantidadeMinima > 0 && i.quantidade <= i.quantidadeMinima) return "baixo";
  return "ok";
}
