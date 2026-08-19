"use client";

import * as React from "react";
import { MAX_CODIGOS } from "@/lib/relatorios-filtros";
import { SeletorMultiplo, type Opcao } from "@/components/relatorios/seletor-multiplo";

// Os três seletores de recorte — equipe, carteira e operadora.
//
// Um componente e não dois blocos copiados: até a decisão 39 este JSX existia
// duas vezes, byte a byte, em `relatorios/cobranca/painel.tsx` e
// `relatorios/carteira/painel.tsx`, incluindo o `useMemo` que desempata nome de
// equipe repetido. Duas cópias do mesmo cálculo é como a lista de papéis
// divergiu na decisão 25.1.

/**
 * O recorte em uma frase — "2 carteiras · EQUIPE AZUL".
 *
 * Existe porque "recorte aplicado" (o texto de antes) deixou de bastar quando o
 * filtro passou a aceitar vários: a pessoa precisa ler o que está vendo sem
 * abrir três diálogos. O mesmo texto vai para a capa da planilha, e é de
 * propósito que ele saia de uma função só — uma planilha que diz um recorte e
 * uma tela que diz outro é pior que nenhuma das duas.
 *
 * Devolve `null` quando não há recorte nenhum: quem chama decide se escreve
 * "tudo" ou nada.
 */
export function descreverRecorte(
  listas: ListasDeFiltro | null,
  sel: { equipes: string[]; carteiras: string[]; operadoras: string[] },
): string | null {
  const partes: string[] = [];

  const descrever = (
    escolhidos: string[],
    opcoes: { cod: number; nome: string }[] | undefined,
    singular: string,
    plural: string,
  ) => {
    if (escolhidos.length === 0) return;
    if (escolhidos.length === 1) {
      // O nome quando é um só; o código cru se a lista ainda não chegou do CRM
      // (mais honesto que "1 carteira" para uma escolha feita pelo nome).
      const achado = (opcoes ?? []).find((o) => String(o.cod) === escolhidos[0]);
      partes.push(achado ? achado.nome : `${singular} ${escolhidos[0]}`);
      return;
    }
    partes.push(`${escolhidos.length} ${plural}`);
  };

  descrever(sel.carteiras, listas?.carteiras, "carteira", "carteiras");
  descrever(sel.equipes, listas?.equipes, "equipe", "equipes");
  descrever(sel.operadoras, listas?.operadoras, "operadora", "operadoras");

  return partes.length ? partes.join(" · ") : null;
}

export type ListasDeFiltro = {
  equipes: { cod: number; nome: string; membros: number }[];
  carteiras: { cod: number; nome: string }[];
  /**
   * Vem vazia para quem não pode recortar por operadora — a rota de filtros da
   * carteira já corta por papel. O seletor some sozinho.
   */
  operadoras?: { cod: number; nome: string; equipe: string | null }[];
};

type Props = {
  listas: ListasDeFiltro | null;
  equipes: string[];
  aoMudarEquipes: (v: string[]) => void;
  carteiras: string[];
  aoMudarCarteiras: (v: string[]) => void;
  operadoras: string[];
  aoMudarOperadoras: (v: string[]) => void;
};

export function FiltrosComuns({
  listas,
  equipes,
  aoMudarEquipes,
  carteiras,
  aoMudarCarteiras,
  operadoras,
  aoMudarOperadoras,
}: Props) {
  // Nome de equipe se repete no Siscobra ("COOPERATIVAS" é o grupo 15 E o 21).
  // Quem escolhe é o código; a tela mostra o número só quando precisa desempatar.
  const opcoesEquipe = React.useMemo<Opcao[]>(() => {
    const lista = listas?.equipes ?? [];
    const contagem = new Map<string, number>();
    for (const e of lista) contagem.set(e.nome, (contagem.get(e.nome) ?? 0) + 1);
    return lista.map((e) => ({
      valor: String(e.cod),
      rotulo:
        (contagem.get(e.nome) ?? 0) > 1 ? `${e.nome} (grupo ${e.cod})` : e.nome,
      nota: `${e.membros} ${e.membros === 1 ? "pessoa" : "pessoas"}`,
    }));
  }, [listas]);

  const opcoesCarteira = React.useMemo<Opcao[]>(
    () =>
      (listas?.carteiras ?? []).map((c) => ({
        valor: String(c.cod),
        rotulo: c.nome,
        nota: `código ${c.cod}`,
      })),
    [listas],
  );

  // A equipe vai como nota porque a lista de operadoras NÃO é filtrada por
  // atividade (ver `operadoras()` em lib/relatorios-cobranca.ts): são as 353 do
  // cadastro, e "EQUIPE AZUL" ao lado do nome é o que distingue a pessoa atual
  // da homônima que saiu há anos.
  const opcoesOperadora = React.useMemo<Opcao[]>(
    () =>
      (listas?.operadoras ?? []).map((o) => ({
        valor: String(o.cod),
        rotulo: o.nome,
        nota: o.equipe ?? "sem equipe",
      })),
    [listas],
  );

  return (
    <>
      <label className="min-w-[11rem] flex-1 space-y-1">
        <span className="eyebrow block">equipe</span>
        <SeletorMultiplo
          rotulo="equipe"
          rotuloTodos="Todas as equipes"
          opcoes={opcoesEquipe}
          selecionados={equipes}
          aoAplicar={aoMudarEquipes}
          max={MAX_CODIGOS}
        />
      </label>

      <label className="min-w-[12rem] flex-1 space-y-1">
        <span className="eyebrow block">carteira</span>
        <SeletorMultiplo
          rotulo="carteira"
          rotuloTodos="Todas as carteiras"
          opcoes={opcoesCarteira}
          selecionados={carteiras}
          aoAplicar={aoMudarCarteiras}
          max={MAX_CODIGOS}
        />
      </label>

      {/* Some para quem não pode recortar por operadora. Não é só estética: a
          API responde 403 a esse filtro (decisão 36), e oferecer um seletor que
          só devolve erro é pior do que não oferecer nenhum. */}
      {(listas?.operadoras?.length ?? 0) > 0 && (
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="eyebrow block">operadora</span>
          <SeletorMultiplo
            rotulo="operadora"
            rotuloTodos="Todas as operadoras"
            opcoes={opcoesOperadora}
            selecionados={operadoras}
            aoAplicar={aoMudarOperadoras}
            max={MAX_CODIGOS}
          />
        </label>
      )}
    </>
  );
}
