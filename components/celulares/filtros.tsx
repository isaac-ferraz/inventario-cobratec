"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SeletorMultiplo,
  type Opcao,
} from "@/components/relatorios/seletor-multiplo";
import type { Funcionario } from "./types";

/** Teto de itens por filtro — o mesmo da lista de computadores. */
const MAX = 50;

type Props = {
  busca: string;
  setBusca: (v: string) => void;
  filtroFunc: string[];
  setFiltroFunc: (v: string[]) => void;
  filtroCargo: string[];
  setFiltroCargo: (v: string[]) => void;
  funcionarios: Funcionario[];
  cargos: string[];
  total: number;
};

export function Filtros({
  busca,
  setBusca,
  filtroFunc,
  setFiltroFunc,
  filtroCargo,
  setFiltroCargo,
  funcionarios,
  cargos,
  total,
}: Props) {
  const opFunc = React.useMemo<Opcao[]>(
    () => [
      { valor: "com", rotulo: "— Com funcionário (em uso) —" },
      { valor: "sem", rotulo: "— Sem funcionário —" },
      ...funcionarios.map((f) => ({ valor: f.id, rotulo: f.nome, nota: f.cargo })),
    ],
    [funcionarios],
  );
  const opCargo = React.useMemo<Opcao[]>(
    () => cargos.map((c) => ({ valor: c, rotulo: c })),
    [cargos],
  );

  const algumFiltro =
    busca !== "" || filtroFunc.length > 0 || filtroCargo.length > 0;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 pt-6">
        <div className="space-y-1.5">
          <Label htmlFor="busca">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Identificador, modelo, número, IMEI..."
              className="w-64 pl-8"
            />
          </div>
        </div>
        <div className="w-56 space-y-1.5">
          <Label>Funcionário</Label>
          <SeletorMultiplo
            rotulo="funcionário"
            rotuloTodos="Todos"
            opcoes={opFunc}
            selecionados={filtroFunc}
            aoAplicar={setFiltroFunc}
            max={MAX}
          />
        </div>
        <div className="w-48 space-y-1.5">
          <Label>Cargo</Label>
          <SeletorMultiplo
            rotulo="cargo"
            rotuloTodos="Todos"
            opcoes={opCargo}
            selecionados={filtroCargo}
            aoAplicar={setFiltroCargo}
            max={MAX}
          />
        </div>
        {algumFiltro && (
          <Button
            variant="ghost"
            onClick={() => {
              setBusca("");
              setFiltroFunc([]);
              setFiltroCargo([]);
            }}
          >
            Limpar filtros
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {total} celular(es)
        </div>
      </CardContent>
    </Card>
  );
}
