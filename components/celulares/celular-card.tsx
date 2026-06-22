"use client";

import { Loader2, PackageOpen, Pencil, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Celular } from "./types";

type Props = {
  celular: Celular;
  removendoId: string | null;
  onEditar: (c: Celular) => void;
  onRemover: (c: Celular) => void;
};

// Uma linha do "data sheet" (rótulo + valor em monospace).
function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className="eyebrow self-center">{rotulo}</dt>
      <dd className="break-all font-mono text-xs text-foreground">{valor}</dd>
    </>
  );
}

export function CelularCard({ celular: c, removendoId, onEditar, onRemover }: Props) {
  const emUso = !!c.funcionario;
  const temDados = c.numero || c.operadora || c.imei;

  return (
    <article className="relative overflow-hidden rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Spine de status (etiqueta de ativo) */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          emUso ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <div className="space-y-3 p-4 pl-5">
        {/* Cabeçalho: patrimônio + LED + ações */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">patrimônio</div>
            <div className="flex items-center gap-2">
              <span
                className={cn("led", emUso ? "text-emerald-500" : "text-amber-500")}
              />
              <h3 className="flex items-center gap-1.5 truncate font-display text-lg font-semibold tracking-tight">
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                {c.identificador}
              </h3>
            </div>
            {c.apelido && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {c.apelido}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Editar / mover"
              aria-label={`Editar ${c.identificador}`}
              onClick={() => onEditar(c)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Remover"
              aria-label={`Remover ${c.identificador}`}
              disabled={removendoId === c.id}
              onClick={() => onRemover(c)}
            >
              {removendoId === c.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 className="text-destructive" />
              )}
            </Button>
          </div>
        </div>

        {/* Dono / estoque */}
        <div>
          {c.funcionario ? (
            <Badge variant="secondary">
              {c.funcionario.nome} · {c.funcionario.cargo}
            </Badge>
          ) : (
            <Badge variant="warning">
              <PackageOpen className="mr-1 h-3 w-3" /> Sem funcionário (estoque)
            </Badge>
          )}
        </div>

        {/* Data sheet (em monospace) */}
        {temDados && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-dashed bg-muted/30 p-2.5">
            {c.numero && <Dado rotulo="número" valor={c.numero} />}
            {c.operadora && <Dado rotulo="operadora" valor={c.operadora} />}
            {c.imei && <Dado rotulo="imei" valor={c.imei} />}
          </dl>
        )}

        {c.observacoes && (
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {c.observacoes}
          </p>
        )}
      </div>
    </article>
  );
}
