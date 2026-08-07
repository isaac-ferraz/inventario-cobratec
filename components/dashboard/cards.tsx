"use client";

import * as React from "react";
import {
  CheckCircle2,
  LifeBuoy,
  Monitor,
  PackageOpen,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserX,
  Users,
  Wrench,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GatilhoDetalhe } from "./detalhe";
import type { Barra, Detalhe, Tom } from "./tipos";
import { cn } from "@/lib/utils";

// Ícone por NOME, não por componente: um componente é uma função, e função não
// atravessa a fronteira servidor → cliente (o React recusa com
// "Functions cannot be passed directly to Client Components"). A página manda a
// string; a escolha do desenho acontece aqui.
const ICONES = {
  monitor: Monitor,
  usuarios: Users,
  celular: Smartphone,
  estoque: PackageOpen,
  suporte: LifeBuoy,
  semResponsavel: UserX,
  resolvido: CheckCircle2,
  conserto: Wrench,
  garantia: ShieldAlert,
  descarte: Trash2,
} as const;

export type NomeIcone = keyof typeof ICONES;

// Peças visuais do Dashboard. Todas abrem o pop-up de detalhe em vez de navegar:
// ver "quais?" sem perder o painel é o gesto do dia a dia; ir para a tela cheia
// é a exceção, e mora no link pequeno do rodapé do pop-up.

const COR_BARRA: Record<Tom, string> = {
  neutro: "bg-primary",
  alerta: "bg-amber-500",
  ok: "bg-emerald-500",
  apagado: "bg-muted-foreground/40",
};

const COR_NUMERO: Record<Tom, string> = {
  neutro: "",
  alerta: "num-alerta",
  ok: "num-ok",
  apagado: "text-muted-foreground",
};

export function Kpi({
  titulo,
  valor,
  icone,
  detalhe,
  rodape,
  tom = "neutro",
}: {
  titulo: string;
  valor: number;
  icone: NomeIcone;
  detalhe: Detalhe;
  rodape?: React.ReactNode;
  tom?: Tom;
}) {
  const Icone = ICONES[icone];
  return (
    <GatilhoDetalhe
      titulo={titulo}
      descricao={detalhe.descricao}
      itens={detalhe.itens}
      total={detalhe.total}
      href={detalhe.href}
      rotuloAcessivel={`${titulo}: ${valor}. Ver quais.`}
      className="h-full rounded-md"
    >
      <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-0.5", COR_BARRA[tom])}
        />
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{titulo}</span>
            <Icone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div
            className={cn(
              "mt-2 font-display text-3xl font-bold tabular-nums",
              COR_NUMERO[tom],
            )}
          >
            {valor}
          </div>
          {rodape && <div className="eyebrow mt-1">{rodape}</div>}
        </CardContent>
      </Card>
    </GatilhoDetalhe>
  );
}

export function BarList({ dados, cor }: { dados: Barra[]; cor: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados ainda.</p>;
  }
  return (
    <div className="space-y-2.5">
      {dados.map((d) => (
        <GatilhoDetalhe
          key={d.label}
          titulo={d.label}
          descricao={d.detalhe.descricao}
          itens={d.detalhe.itens}
          total={d.detalhe.total}
          href={d.detalhe.href}
          rotuloAcessivel={`${d.label}: ${d.valor}. Ver quais.`}
          className="rounded-sm px-1 py-0.5 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{d.label}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {d.valor}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", cor)}
              style={{ width: `${(d.valor / max) * 100}%` }}
            />
          </div>
        </GatilhoDetalhe>
      ))}
    </div>
  );
}

export function CardPendencia({
  rotulo,
  valor,
  totalPcs,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  totalPcs: number;
  detalhe: Detalhe;
}) {
  const ok = valor === 0;

  const conteudo = (
    <>
      <div className="flex items-center gap-1.5">
        <span className={cn("led", ok ? "text-emerald-500" : "text-amber-500")} />
        <div className="text-xs text-muted-foreground">{rotulo}</div>
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-bold tabular-nums",
          ok ? "num-ok" : "num-alerta",
        )}
      >
        {valor}
      </div>
      <div className="eyebrow">
        {totalPcs === 0
          ? "—"
          : ok
            ? "tudo registrado"
            : `de ${totalPcs} PCs · ver quais`}
      </div>
    </>
  );

  // Zero não abre nada: um pop-up vazio frustra mais do que ajuda.
  if (ok) {
    return (
      <div className="rounded-md border border-border p-3">{conteudo}</div>
    );
  }

  return (
    <GatilhoDetalhe
      titulo={rotulo}
      descricao={detalhe.descricao}
      itens={detalhe.itens}
      total={detalhe.total}
      href={detalhe.href}
      rotuloAcessivel={`${rotulo}: ${valor} computador(es). Ver quais.`}
      className="rounded-md border border-amber-300 bg-amber-50/50 p-3 transition-shadow hover:shadow-md dark:border-amber-800/60 dark:bg-amber-950/40"
    >
      {conteudo}
    </GatilhoDetalhe>
  );
}
