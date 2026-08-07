"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filtro de tela que vive na URL em vez de só no useState.
//
// POR QUÊ: sem isso, o Dashboard não consegue mandar ninguém para uma lista já
// filtrada — "Sem licença Windows: 7" seria um número que não leva a lugar
// nenhum. De brinde, o filtro passa a sobreviver ao F5 e vira link que o
// analista manda para o colega.
//
// `replace` e não `push`: mexer num select não é navegação, e encher o histórico
// faria o botão Voltar percorrer cada mudança de filtro antes de sair da tela.

/**
 * Um filtro sincronizado com a query string.
 *
 * @param chave nome do parâmetro na URL (ex.: "sala")
 * @param padrao valor que significa "sem filtro" — some da URL quando escolhido
 */
export function useFiltroUrl(
  chave: string,
  padrao: string,
): [string, (valor: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const valor = searchParams.get(chave) ?? padrao;

  const definir = React.useCallback(
    (novo: string) => {
      const p = new URLSearchParams(searchParams.toString());
      // O valor padrão sai da URL: `?sala=todos` é ruído num link.
      if (novo === padrao) p.delete(chave);
      else p.set(chave, novo);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, chave, padrao],
  );

  return [valor, definir];
}

/** Limpa vários filtros de uma vez, com uma única troca de URL. */
export function useLimparFiltros(chaves: string[]): () => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return React.useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    for (const c of chaves) p.delete(c);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // `chaves` é literal nas telas que usam; serializar evita recriar o callback
    // a cada render por causa da identidade do array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname, searchParams, chaves.join(",")]);
}
