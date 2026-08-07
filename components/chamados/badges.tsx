"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  type Prioridade,
  type Status,
} from "@/lib/chamados";

// Cores como leitura de instrumento (mesma linguagem do resto do painel):
// âmbar = pede atenção, teal = em curso, verde = resolvido, cinza = encerrado.
const COR_STATUS: Record<Status, string> = {
  aberto: "tom-alerta",
  em_andamento: "border-primary/40 bg-primary/10 text-primary",
  aguardando: "tom-espera",
  resolvido: "tom-ok",
  fechado: "border-border bg-muted text-muted-foreground",
};

const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "border-border bg-muted text-muted-foreground",
  normal: "border-border bg-secondary text-secondary-foreground",
  alta: "tom-urgente",
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className={cn("font-medium", COR_STATUS[status])}>
      {ROTULO_STATUS[status]}
    </Badge>
  );
}

export function PrioridadeBadge({ prioridade }: { prioridade: Prioridade }) {
  // "normal" é o padrão e não merece destaque visual — só polui a lista.
  if (prioridade === "normal") return null;
  return (
    <Badge variant="outline" className={cn("font-medium", COR_PRIORIDADE[prioridade])}>
      {ROTULO_PRIORIDADE[prioridade]}
    </Badge>
  );
}

// "há 5 min", "há 2 h", "há 3 d" — o TI raciocina em tempo decorrido.
export function decorrido(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
