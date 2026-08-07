"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROTULO_SITUACAO, SITUACOES } from "@/lib/ativos";
import { PENDENCIAS } from "@/lib/pendencias";
import type { Funcionario, Sala, Tipo } from "./types";

type Props = {
  busca: string;
  setBusca: (v: string) => void;
  filtroFunc: string;
  setFiltroFunc: (v: string) => void;
  filtroCargo: string;
  setFiltroCargo: (v: string) => void;
  filtroSala: string;
  setFiltroSala: (v: string) => void;
  filtroSituacao: string;
  setFiltroSituacao: (v: string) => void;
  filtroPendencia: string;
  setFiltroPendencia: (v: string) => void;
  filtroTipo: string;
  setFiltroTipo: (v: string) => void;
  filtroGarantia: string;
  setFiltroGarantia: (v: string) => void;
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
  const algumFiltro =
    busca !== "" ||
    filtroFunc !== "todos" ||
    filtroCargo !== "todos" ||
    filtroSala !== "todos" ||
    filtroSituacao !== "todas" ||
    filtroPendencia !== "todas" ||
    filtroTipo !== "todos" ||
    filtroGarantia !== "todas";

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
        <div className="space-y-1.5">
          <Label>Funcionário</Label>
          <Select value={filtroFunc} onValueChange={setFiltroFunc}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="com">— Com funcionário (em uso) —</SelectItem>
              <SelectItem value="sem">— Sem funcionário —</SelectItem>
              {funcionarios.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Cargo</Label>
          <Select value={filtroCargo} onValueChange={setFiltroCargo}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {cargos.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Sala</Label>
          <Select value={filtroSala} onValueChange={setFiltroSala}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="sem">— Sem sala definida —</SelectItem>
              {salas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Situação</Label>
          <Select value={filtroSituacao} onValueChange={setFiltroSituacao}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {SITUACOES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ROTULO_SITUACAO[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Pendência</Label>
          <Select value={filtroPendencia} onValueChange={setFiltroPendencia}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {PENDENCIAS.map((p) => (
                <SelectItem key={p.chave} value={p.chave}>
                  {p.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Componente</Label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Garantia</Label>
          <Select value={filtroGarantia} onValueChange={setFiltroGarantia}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="vencendo">Acabando</SelectItem>
              <SelectItem value="vencida">Fora da garantia</SelectItem>
              <SelectItem value="vigente">Em dia</SelectItem>
              <SelectItem value="sem">Sem data</SelectItem>
            </SelectContent>
          </Select>
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
