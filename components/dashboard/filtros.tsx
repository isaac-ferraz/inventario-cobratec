"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SeletorMultiplo,
  type Opcao,
} from "@/components/relatorios/seletor-multiplo";
import { useFiltroLista, useLimparFiltros } from "@/hooks/use-filtro-url";
import { ROTULO_SITUACAO, SITUACOES } from "@/lib/ativos";
import { CHAVES_DASHBOARD } from "@/lib/dashboard-filtros";

// A barra de filtros do Dashboard de Informática (decisão 39).
//
// Client component dentro de uma página que é Server Component: ela precisa ser
// interativa (o diálogo do seletor), mas quem FILTRA é o servidor — o hook
// escreve na URL, o Next recarrega a página e o `where` do Prisma sai recortado.
//
// É o inverso das listas de `/computadores`, onde a filtragem é em memória no
// cliente. Aqui não dá: o painel calcula agregados sobre o parque inteiro, e
// mandar tudo para o navegador só para contar seria trazer o inventário duas
// vezes.
//
// A lista de salas vem do servidor JÁ RECORTADA pelo escopo do supervisor. Não é
// só estética: ele não deve nem enxergar o nome de uma sala que não é dele. O
// portão de verdade continua no `where` (ver `ondeComputadorFiltrado`), porque
// esconder a opção não impede ninguém de digitar o id na barra de endereços.

/** Teto de itens por filtro — o mesmo das listas do inventário. */
const MAX = 50;

type Props = {
  salas: { id: string; nome: string }[];
  cargos: string[];
};

export function FiltrosDashboard({ salas, cargos }: Props) {
  const [cargo, setCargo] = useFiltroLista("cargo");
  const [sala, setSala] = useFiltroLista("sala");
  const [situacao, setSituacao] = useFiltroLista("situacao");
  const limpar = useLimparFiltros([...CHAVES_DASHBOARD]);

  const opSala = React.useMemo<Opcao[]>(
    () => [
      { valor: "sem", rotulo: "— Sem sala definida —" },
      ...salas.map((s) => ({ valor: s.id, rotulo: s.nome })),
    ],
    [salas],
  );
  const opCargo = React.useMemo<Opcao[]>(
    () => cargos.map((c) => ({ valor: c, rotulo: c })),
    [cargos],
  );
  const opSituacao = React.useMemo<Opcao[]>(
    () => SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })),
    [],
  );

  const algum = cargo.length > 0 || sala.length > 0 || situacao.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      <label className="w-52 space-y-1">
        <span className="eyebrow block">sala</span>
        <SeletorMultiplo
          rotulo="sala"
          rotuloTodos="Todas as salas"
          opcoes={opSala}
          selecionados={sala}
          aoAplicar={setSala}
          max={MAX}
        />
      </label>

      <label className="w-48 space-y-1">
        <span className="eyebrow block">cargo</span>
        <SeletorMultiplo
          rotulo="cargo"
          rotuloTodos="Todos os cargos"
          opcoes={opCargo}
          selecionados={cargo}
          aoAplicar={setCargo}
          max={MAX}
        />
      </label>

      <label className="w-44 space-y-1">
        <span className="eyebrow block">situação</span>
        <SeletorMultiplo
          rotulo="situação"
          rotuloTodos="Todas"
          opcoes={opSituacao}
          selecionados={situacao}
          aoAplicar={setSituacao}
          max={MAX}
        />
      </label>

      {algum && (
        <Button variant="ghost" size="sm" onClick={limpar}>
          <X className="mr-1.5 h-3.5 w-3.5" />
          Limpar
        </Button>
      )}

      <p className="ml-auto max-w-md text-xs text-muted-foreground">
        Os números abaixo respondem ao recorte, e os links levam a lista já
        filtrada do mesmo jeito.
      </p>
    </div>
  );
}
