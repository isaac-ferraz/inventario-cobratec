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
import type { Funcionario } from "./types";

type Props = {
  busca: string;
  setBusca: (v: string) => void;
  filtroFunc: string;
  setFiltroFunc: (v: string) => void;
  filtroCargo: string;
  setFiltroCargo: (v: string) => void;
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
  const algumFiltro =
    busca !== "" || filtroFunc !== "todos" || filtroCargo !== "todos";

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
        {algumFiltro && (
          <Button
            variant="ghost"
            onClick={() => {
              setBusca("");
              setFiltroFunc("todos");
              setFiltroCargo("todos");
            }}
          >
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
