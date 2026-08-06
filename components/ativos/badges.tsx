"use client";

import { ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ROTULO_SITUACAO,
  diasAteGarantia,
  estadoGarantia,
  type Situacao,
} from "@/lib/ativos";

const COR_SITUACAO: Record<Situacao, string> = {
  ativo: "", // situação normal não merece badge (ver abaixo)
  manutencao: "border-amber-300 bg-amber-50 text-amber-700",
  reserva: "border-violet-300 bg-violet-50 text-violet-700",
  descartado: "border-border bg-muted text-muted-foreground line-through",
};

// "Ativo" é o padrão: badge em toda máquina normal só polui a lista. Mostramos
// apenas o que foge do esperado.
export function SituacaoBadge({ situacao }: { situacao: string }) {
  if (situacao === "ativo" || !(situacao in COR_SITUACAO)) return null;
  const s = situacao as Situacao;
  return (
    <Badge variant="outline" className={cn("font-medium", COR_SITUACAO[s])}>
      {s === "manutencao" && <Wrench className="mr-1 h-3 w-3" />}
      {ROTULO_SITUACAO[s]}
    </Badge>
  );
}

// Só aparece quando é acionável: vencendo (dá tempo de acionar a assistência)
// ou vencida (não adianta mais tentar garantia). Vigente é silêncio.
export function GarantiaBadge({
  garantiaAte,
}: {
  garantiaAte: string | null | undefined;
}) {
  const estado = estadoGarantia(garantiaAte);
  if (estado === "sem" || estado === "vigente") return null;

  const dias = diasAteGarantia(garantiaAte!);
  return estado === "vencendo" ? (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-50 font-medium text-amber-700"
      title={`Garantia termina em ${new Date(garantiaAte!).toLocaleDateString("pt-BR")}`}
    >
      <ShieldAlert className="mr-1 h-3 w-3" />
      garantia acaba em {dias} d
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-border bg-muted font-medium text-muted-foreground"
      title={`Garantia terminou em ${new Date(garantiaAte!).toLocaleDateString("pt-BR")}`}
    >
      <ShieldCheck className="mr-1 h-3 w-3" />
      fora da garantia
    </Badge>
  );
}
