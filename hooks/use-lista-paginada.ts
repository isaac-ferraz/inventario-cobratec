"use client";

import * as React from "react";
import { apiGet, mensagem } from "@/lib/fetcher";
import type { Pagina } from "@/lib/paginacao";

// Lado cliente da paginação (lib/paginacao.ts): busca a primeira página, guarda
// o que já veio e acrescenta as próximas com "carregar mais".
//
// `construirUrl` PRECISA vir de um React.useCallback com as dependências certas
// (os filtros da tela). É essa identidade que dispara a recarga quando o filtro
// muda — e um callback recriado a cada render viraria laço infinito.

type Retorno<T, E> = {
  itens: T[];
  total: number;
  temMais: boolean;
  carregando: boolean;
  carregandoMais: boolean;
  erro: string | null;
  recarregar: () => void;
  carregarMais: () => void;
  /**
   * Campos que a rota devolve além da página — números agregados do conjunto
   * inteiro (ex.: o custo somado das manutenções). Ficam FORA da lista de
   * propósito: um total calculado sobre a página carregada seria um número
   * errado com cara de certo.
   */
  extra: E | null;
  /** Para ajustes locais (ex.: sumir com um item recém-removido). */
  setItens: React.Dispatch<React.SetStateAction<T[]>>;
};

export function useListaPaginada<T, E = Record<string, never>>(
  construirUrl: (pagina: number) => string,
): Retorno<T, E> {
  const [itens, setItens] = React.useState<T[]>([]);
  const [total, setTotal] = React.useState(0);
  const [temMais, setTemMais] = React.useState(false);
  const [pagina, setPagina] = React.useState(1);
  const [carregando, setCarregando] = React.useState(true);
  const [carregandoMais, setCarregandoMais] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState<E | null>(null);

  const buscar = React.useCallback(
    async (alvo: number) => {
      const primeira = alvo === 1;
      if (primeira) setCarregando(true);
      else setCarregandoMais(true);
      setErro(null);
      try {
        const r = await apiGet<Pagina<T> & E>(construirUrl(alvo));
        // Página 1 substitui (troca de filtro); as demais acrescentam.
        setItens((atuais) => (primeira ? r.itens : [...atuais, ...r.itens]));
        setTotal(r.total);
        setTemMais(r.temMais);
        setPagina(r.pagina);
        setExtra(r as unknown as E);
      } catch (e) {
        setErro(mensagem(e));
      } finally {
        setCarregando(false);
        setCarregandoMais(false);
      }
    },
    [construirUrl],
  );

  // Filtro mudou (nova identidade de `construirUrl`) → volta para a página 1.
  React.useEffect(() => {
    buscar(1);
  }, [buscar]);

  return {
    itens,
    total,
    temMais,
    carregando,
    carregandoMais,
    erro,
    extra,
    recarregar: React.useCallback(() => {
      buscar(1);
    }, [buscar]),
    carregarMais: React.useCallback(() => {
      buscar(pagina + 1);
    }, [buscar, pagina]),
    setItens,
  };
}
