"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// A chave entre os dois relatórios da casa.
//
// São dois ofícios olhando números diferentes: o TI pergunta "quantas máquinas,
// quais pendências"; a operação pergunta "quantos acordos hoje". Um seletor no
// mesmo lugar das duas telas deixa a troca ser um gesto, e não uma caçada pelo
// menu lateral.
//
// Não recebe `papel`: quem enxerga o dashboard de informática (`/`) é
// exatamente quem enxerga o relatório de cobrança — admin e supervisor, a mesma
// dupla em `PERMITIDO_SUPERVISOR` (middleware) e em `exigirRelatorio`
// (lib/autorizacao.ts). Operador e cobrança não chegam a nenhuma das duas telas
// e portanto nunca veem este componente.

const RELATORIOS = [
  { href: "/", rotulo: "Informática", icone: Gauge },
  { href: "/relatorios/cobranca", rotulo: "Cobrança", icone: TrendingUp },
];

export function AlternadorRelatorio() {
  const pathname = usePathname();
  return (
    <div
      role="tablist"
      aria-label="Escolher relatório"
      className="inline-flex shrink-0 gap-0.5 rounded-lg border bg-muted/50 p-0.5"
    >
      {RELATORIOS.map((r) => {
        const on = r.href === "/" ? pathname === "/" : pathname.startsWith(r.href);
        return (
          <Link
            key={r.href}
            href={r.href}
            role="tab"
            aria-selected={on}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              on
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <r.icone className="h-3.5 w-3.5" />
            {r.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
