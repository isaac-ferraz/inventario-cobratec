"use client";

import * as React from "react";
import { Loader2, Monitor, Search, User } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CandidatoComputador, CandidatoFuncionario } from "./types";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  salaId: string;
  salaNome: string;
  onMovido: () => void;
};

// Onde o item está hoje — o que o TI precisa saber antes de puxar para cá.
function origem(sala: { nome: string } | null) {
  return sala ? sala.nome : "sem sala";
}

export function TrazerDialog({
  aberto,
  onOpenChange,
  salaId,
  salaNome,
  onMovido,
}: Props) {
  const [computadores, setComputadores] = React.useState<CandidatoComputador[]>(
    [],
  );
  const [funcionarios, setFuncionarios] = React.useState<
    CandidatoFuncionario[]
  >([]);
  const [carregando, setCarregando] = React.useState(false);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  const [selPcs, setSelPcs] = React.useState<Set<string>>(new Set());
  const [selFuncs, setSelFuncs] = React.useState<Set<string>>(new Set());
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Carrega os candidatos toda vez que abre (o inventário pode ter mudado).
  React.useEffect(() => {
    if (!aberto) return;
    setBusca("");
    setSelPcs(new Set());
    setSelFuncs(new Set());
    setErro(null);
    setCarregando(true);
    setCarregaErro(null);
    Promise.all([
      apiGet<CandidatoComputador[]>("/api/computadores"),
      apiGet<CandidatoFuncionario[]>("/api/funcionarios"),
    ])
      .then(([c, f]) => {
        // Só faz sentido trazer quem ainda não está aqui.
        setComputadores(c.filter((x) => x.salaId !== salaId));
        setFuncionarios(f.filter((x) => x.salaId !== salaId));
      })
      .catch((e) => setCarregaErro(mensagem(e)))
      .finally(() => setCarregando(false));
  }, [aberto, salaId]);

  const termo = busca.trim().toLowerCase();
  const pcsFiltrados = computadores.filter((c) =>
    !termo
      ? true
      : [c.identificador, c.apelido, c.funcionario?.nome, c.sala?.nome]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
  );
  const funcsFiltrados = funcionarios.filter((f) =>
    !termo
      ? true
      : [f.nome, f.cargo, f.sala?.nome]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
  );

  function alternar(set: Set<string>, id: string) {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  const total = selPcs.size + selFuncs.size;

  async function trazer() {
    setSalvando(true);
    setErro(null);
    try {
      await apiSend("/api/salas/mover", "POST", {
        destinoSalaId: salaId,
        computadorIds: [...selPcs],
        funcionarioIds: [...selFuncs],
      });
      onMovido();
      onOpenChange(false);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trazer para {salaNome}</DialogTitle>
          <DialogDescription>
            Marque os computadores e funcionários que passam a ficar nesta sala.
            Eles saem automaticamente da sala anterior — e quem vem traz junto os
            computadores que são dele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="busca-trazer">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="busca-trazer"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Patrimônio, apelido, nome, sala atual..."
                className="pl-8"
              />
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : carregaErro ? (
            <p className="text-sm text-destructive">{carregaErro}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="space-y-2">
                <div className="eyebrow flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" /> computadores
                </div>
                {pcsFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum computador fora desta sala.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
                    {pcsFiltrados.map((c) => (
                      <li key={c.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted",
                            selPcs.has(c.id) && "bg-muted",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={selPcs.has(c.id)}
                            onChange={() =>
                              setSelPcs((s) => alternar(s, c.id))
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-xs font-medium">
                              {c.identificador}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.apelido ? `${c.apelido} · ` : ""}
                              {origem(c.sala)}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <div className="eyebrow flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> funcionários
                </div>
                {funcsFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum funcionário fora desta sala.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
                    {funcsFiltrados.map((f) => (
                      <li key={f.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted",
                            selFuncs.has(f.id) && "bg-muted",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={selFuncs.has(f.id)}
                            onChange={() =>
                              setSelFuncs((s) => alternar(s, f.id))
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {f.nome}
                              {!f.ativo && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  (inativo)
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {f.cargo} · {origem(f.sala)}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={trazer} disabled={salvando || total === 0}>
            {salvando && <Loader2 className="animate-spin" />}
            Trazer {total > 0 ? `${total} item(ns)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
