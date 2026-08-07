"use client";

import Link from "next/link";
import {
  DoorOpen,
  Headphones,
  Keyboard,
  Loader2,
  Mouse,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GarantiaBadge, SituacaoBadge } from "@/components/ativos/badges";
import type { Componente, Computador } from "./types";

type Props = {
  computador: Computador;
  removendoPcId: string | null;
  removendoCompId: string | null;
  onEditar: (c: Computador) => void;
  onRemover: (c: Computador) => void;
  onNovoComp: (pcId: string) => void;
  onEditarComp: (pcId: string, comp: Componente) => void;
  onRemoverComp: (comp: Componente) => void;
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

function PerifChip({
  on,
  icon: Icon,
  label,
}: {
  on: boolean;
  icon: typeof Mouse;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
        on
          ? "border-border bg-secondary text-secondary-foreground"
          : "border-dashed text-muted-foreground line-through opacity-70",
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export function ComputadorCard({
  computador: c,
  removendoPcId,
  removendoCompId,
  onEditar,
  onRemover,
  onNovoComp,
  onEditarComp,
  onRemoverComp,
}: Props) {
  const emUso = !!c.funcionario;
  const temDados =
    c.loginPadrao ||
    c.senha ||
    c.contaOutlook ||
    c.licencaWindows ||
    c.licencaMicrosoft;

  return (
    <article className="relative overflow-hidden rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Spine de status (etiqueta de ativo) */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          c.situacao === "descartado"
            ? "bg-muted-foreground/40"
            : c.situacao === "manutencao"
              ? "bg-amber-500"
              : emUso
                ? "bg-emerald-500"
                : "bg-amber-500",
        )}
      />
      <div className="space-y-3 p-4 pl-5">
        {/* Cabeçalho: patrimônio + LED + ações */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">patrimônio</div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "led",
                  emUso ? "text-emerald-500" : "text-amber-500",
                )}
              />
              <h3 className="truncate font-display text-lg font-semibold tracking-tight">
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
              disabled={removendoPcId === c.id}
              onClick={() => onRemover(c)}
            >
              {removendoPcId === c.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 className="text-destructive" />
              )}
            </Button>
          </div>
        </div>

        {/* Dono / estoque · sala */}
        <div className="flex flex-wrap gap-1.5">
          {c.funcionario ? (
            // O dono é clicável: leva ao perfil com tudo que está na mão dele.
            <Link
              href={`/funcionarios/${c.funcionario.id}`}
              title={`Abrir o perfil de ${c.funcionario.nome}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Badge variant="secondary" className="hover:bg-secondary/70">
                <User className="mr-1 h-3 w-3" />
                {c.funcionario.nome} · {c.funcionario.cargo}
              </Badge>
            </Link>
          ) : (
            <Badge variant="warning">
              <PackageOpen className="mr-1 h-3 w-3" /> Sem funcionário (estoque)
            </Badge>
          )}
          <SituacaoBadge situacao={c.situacao} />
          <GarantiaBadge garantiaAte={c.garantiaAte} />
          {c.sala && (
            // A sala é clicável: leva para a página com tudo que está nela.
            <Link
              href={`/salas/${c.sala.id}`}
              title={`Abrir a sala ${c.sala.nome}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Badge variant="outline" className="hover:bg-muted">
                <DoorOpen className="mr-1 h-3 w-3" /> {c.sala.nome}
              </Badge>
            </Link>
          )}
        </div>

        {/* Data sheet (em monospace) */}
        {temDados && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-dashed bg-muted/30 p-2.5">
            {c.loginPadrao && <Dado rotulo="login" valor={c.loginPadrao} />}
            {c.senha && <Dado rotulo="senha" valor={c.senha} />}
            {c.contaOutlook && <Dado rotulo="outlook" valor={c.contaOutlook} />}
            {c.licencaWindows && (
              <Dado rotulo="windows" valor={c.licencaWindows} />
            )}
            {c.licencaMicrosoft && (
              <Dado rotulo="microsoft" valor={c.licencaMicrosoft} />
            )}
          </dl>
        )}

        {/* Periféricos */}
        <div className="flex flex-wrap gap-1.5">
          <PerifChip on={c.temMouse} icon={Mouse} label="Mouse" />
          <PerifChip on={c.temTeclado} icon={Keyboard} label="Teclado" />
          <PerifChip on={c.temHeadset} icon={Headphones} label="Headset" />
        </div>

        {c.observacoes && (
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {c.observacoes}
          </p>
        )}

        {/* Ficha de hardware */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">hardware · {c.componentes.length}</span>
            <Button variant="outline" size="sm" onClick={() => onNovoComp(c.id)}>
              <Plus /> Componente
            </Button>
          </div>
          {c.componentes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum componente registrado.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {c.componentes.map((comp) => (
                <li
                  key={comp.id}
                  className="flex items-start justify-between gap-2 p-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm">
                      <span className="font-mono text-xs font-medium uppercase tracking-wide text-primary">
                        {comp.tipo.nome}
                      </span>{" "}
                      <span className="text-foreground">{comp.descricao}</span>
                    </div>
                    {comp.especificacoes &&
                      Object.keys(comp.especificacoes).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(comp.especificacoes).map(([k, v]) => (
                            <span
                              key={k}
                              className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px] text-muted-foreground"
                            >
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Editar componente ${comp.tipo.nome}`}
                      title="Editar componente"
                      onClick={() => onEditarComp(c.id, comp)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remover componente ${comp.tipo.nome}`}
                      title="Remover componente"
                      disabled={removendoCompId === comp.id}
                      onClick={() => onRemoverComp(comp)}
                    >
                      {removendoCompId === comp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
