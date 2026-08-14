"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Gauge, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Papel } from "@/lib/supervisao";

// A chave entre os relatórios da casa.
//
// São ofícios olhando números diferentes: o TI pergunta "quantas máquinas,
// quais pendências"; o gestor da operação pergunta "quantos acordos hoje"; e
// quem cobra pergunta "o que vence amanhã". Um seletor no mesmo lugar das três
// telas deixa a troca ser um gesto, e não uma caçada pelo menu lateral.
//
// Passou a receber `papel` quando a carteira entrou. Antes não precisava: quem
// via o dashboard de informática era exatamente quem via o relatório de
// cobrança. A carteira quebrou essa coincidência — a operadora de COBRANCA
// alcança ela e mais nenhuma das outras duas, e uma aba que leva a um redirect
// é pior que aba nenhuma.

const RELATORIOS = [
  { href: "/", rotulo: "Informática", icone: Gauge, papeis: ["ADMIN", "SUPERVISOR"] },
  {
    href: "/relatorios/cobranca",
    rotulo: "Cobrança",
    icone: TrendingUp,
    papeis: ["ADMIN", "SUPERVISOR"],
  },
  {
    href: "/relatorios/carteira",
    rotulo: "Carteira",
    icone: CalendarClock,
    papeis: ["ADMIN", "SUPERVISOR", "COBRANCA"],
  },
] as const;

export function AlternadorRelatorio({ papel }: { papel: Papel }) {
  const pathname = usePathname();
  const visiveis = RELATORIOS.filter((r) =>
    (r.papeis as readonly string[]).includes(papel),
  );
  // Uma aba sozinha não é uma escolha — é um rótulo redundante ao lado do
  // título que já está na tela.
  if (visiveis.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Escolher relatório"
      className="inline-flex shrink-0 gap-0.5 rounded-lg border bg-muted/50 p-0.5"
    >
      {visiveis.map((r) => {
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
