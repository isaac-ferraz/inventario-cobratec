"use client";

import { Loader2, Minus, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { situacao, type ItemDeposito } from "./types";

type Props = {
  item: ItemDeposito;
  removendoId: string | null;
  onAjustar: (item: ItemDeposito, delta: number) => void;
  onEditar: (item: ItemDeposito) => void;
  onRemover: (item: ItemDeposito) => void;
};

const SPINE: Record<string, string> = {
  falta: "bg-red-500",
  baixo: "bg-amber-500",
  ok: "bg-emerald-500",
};

export function ItemCard({
  item: i,
  removendoId,
  onAjustar,
  onEditar,
  onRemover,
}: Props) {
  const s = situacao(i);

  return (
    <article className="relative overflow-hidden rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", SPINE[s])} />
      <div className="space-y-3 p-4 pl-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">{i.categoria || "sem categoria"}</div>
            <h3 className="truncate font-display text-lg font-semibold tracking-tight">
              {i.nome}
            </h3>
            {i.localizacao && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" /> {i.localizacao}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Editar"
              aria-label={`Editar ${i.nome}`}
              onClick={() => onEditar(i)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Remover"
              aria-label={`Remover ${i.nome}`}
              disabled={removendoId === i.id}
              onClick={() => onRemover(i)}
            >
              {removendoId === i.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 className="text-destructive" />
              )}
            </Button>
          </div>
        </div>

        {/* Contador + situação */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={`Diminuir ${i.nome}`}
              disabled={i.quantidade <= 0}
              onClick={() => onAjustar(i, -1)}
            >
              <Minus />
            </Button>
            <div className="min-w-[3.5rem] text-center">
              <div className="font-display text-3xl font-bold tabular-nums leading-none">
                {i.quantidade}
              </div>
              <div className="eyebrow mt-1">unidades</div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={`Aumentar ${i.nome}`}
              onClick={() => onAjustar(i, 1)}
            >
              <Plus />
            </Button>
          </div>
          {s === "falta" ? (
            <Badge variant="destructive">Em falta</Badge>
          ) : s === "baixo" ? (
            <Badge variant="warning">
              Estoque baixo · mín. {i.quantidadeMinima}
            </Badge>
          ) : (
            <Badge variant="success">Em estoque</Badge>
          )}
        </div>

        {i.observacoes && (
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {i.observacoes}
          </p>
        )}
      </div>
    </article>
  );
}
