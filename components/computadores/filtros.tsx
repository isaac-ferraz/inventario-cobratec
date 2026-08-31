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
import { ROTULO_SITUACAO, SITUACOES } from "@/lib/ativos";
import { PENDENCIAS } from "@/lib/pendencias";
import type { Funcionario, Sala, Tipo } from "./types";

// Os filtros da lista de computadores.
//
// Desde a decisão 39 cada um aceita MAIS DE UM valor, com o mesmo seletor dos
// relatórios — o diálogo com busca e checkbox. A busca importa aqui pelo mesmo
// motivo de lá: um escritório com trinta salas e cem funcionários não cabe num
// menu suspenso.
//
// As SENTINELAS continuam sendo opções normais da lista ("— Sem funcionário —"),
// e agora convivem com os ids: marcar "sem sala" junto com "Sala 93" é um
// recorte legítimo (o que falta arrumar, mais o que já está no lugar).

/** Teto de itens por filtro. Local e não importado do CRM: aqui não há SQL. */
const MAX = 50;

type Props = {
  busca: string;
  setBusca: (v: string) => void;
  filtroFunc: string[];
  setFiltroFunc: (v: string[]) => void;
  filtroCargo: string[];
  setFiltroCargo: (v: string[]) => void;
  filtroSala: string[];
  setFiltroSala: (v: string[]) => void;
  filtroSituacao: string[];
  setFiltroSituacao: (v: string[]) => void;
  filtroPendencia: string[];
  setFiltroPendencia: (v: string[]) => void;
  filtroTipo: string[];
  setFiltroTipo: (v: string[]) => void;
  filtroGarantia: string[];
  setFiltroGarantia: (v: string[]) => void;
  onLimpar: () => void;
  funcionarios: Funcionario[];
  salas: Sala[];
  tipos: Tipo[];
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
  filtroSala,
  setFiltroSala,
  filtroSituacao,
  setFiltroSituacao,
  filtroPendencia,
  setFiltroPendencia,
  filtroTipo,
  setFiltroTipo,
  filtroGarantia,
  setFiltroGarantia,
  onLimpar,
  funcionarios,
  salas,
  tipos,
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

  const opTipo = React.useMemo<Opcao[]>(
    () => tipos.map((t) => ({ valor: t.id, rotulo: t.nome })),
    [tipos],
  );

  const opSituacao = React.useMemo<Opcao[]>(
    () => SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO[s] })),
    [],
  );

  const opPendencia = React.useMemo<Opcao[]>(
    () => PENDENCIAS.map((p) => ({ valor: p.chave, rotulo: p.rotulo })),
    [],
  );

  const opGarantia: Opcao[] = [
    { valor: "vencendo", rotulo: "Acabando" },
    { valor: "vencida", rotulo: "Fora da garantia" },
    { valor: "vigente", rotulo: "Em dia" },
    { valor: "sem", rotulo: "Sem data" },
  ];

  const algumFiltro =
    busca !== "" ||
    filtroFunc.length > 0 ||
    filtroCargo.length > 0 ||
    filtroSala.length > 0 ||
    filtroSituacao.length > 0 ||
    filtroPendencia.length > 0 ||
    filtroTipo.length > 0 ||
    filtroGarantia.length > 0;

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
              placeholder="Identificador, apelido, login, conta..."
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

        <div className="w-56 space-y-1.5">
          <Label>Sala</Label>
          <SeletorMultiplo
            rotulo="sala"
            rotuloTodos="Todas"
            opcoes={opSala}
            selecionados={filtroSala}
            aoAplicar={setFiltroSala}
            max={MAX}
          />
        </div>

        <div className="w-44 space-y-1.5">
          <Label>Situação</Label>
          <SeletorMultiplo
            rotulo="situação"
            rotuloTodos="Todas"
            opcoes={opSituacao}
            selecionados={filtroSituacao}
            aoAplicar={setFiltroSituacao}
            max={MAX}
          />
        </div>

        <div className="w-56 space-y-1.5">
          <Label>Pendência</Label>
          <SeletorMultiplo
            rotulo="pendência"
            rotuloTodos="Todas"
            opcoes={opPendencia}
            selecionados={filtroPendencia}
            aoAplicar={setFiltroPendencia}
            max={MAX}
          />
        </div>

        <div className="w-48 space-y-1.5">
          <Label>Componente</Label>
          <SeletorMultiplo
            rotulo="componente"
            rotuloTodos="Todos"
            opcoes={opTipo}
            selecionados={filtroTipo}
            aoAplicar={setFiltroTipo}
            max={MAX}
          />
        </div>

        <div className="w-44 space-y-1.5">
          <Label>Garantia</Label>
          <SeletorMultiplo
            rotulo="garantia"
            rotuloTodos="Todas"
            opcoes={opGarantia}
            selecionados={filtroGarantia}
            aoAplicar={setFiltroGarantia}
            max={MAX}
          />
        </div>

        {algumFiltro && (
          <Button variant="ghost" onClick={onLimpar}>
            Limpar filtros
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {total} computador(es)
        </div>
      </CardContent>
    </Card>
  );
}
