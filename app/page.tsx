// Dashboard — indicadores principais do inventário (mesma base do Excel).
import Link from "next/link";
import {
  Monitor,
  Users,
  PackageOpen,
  Smartphone,
  LifeBuoy,
  UserX,
  CheckCircle2,
  AlarmClock,
  Wrench,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { STATUS_ABERTOS } from "@/lib/chamados";
import { DIAS_AVISO_GARANTIA } from "@/lib/ativos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function BarList({
  dados,
  cor,
}: {
  dados: { label: string; valor: number }[];
  cor: string;
}) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados ainda.</p>;
  }
  return (
    <div className="space-y-2.5">
      {dados.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{d.label}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {d.valor}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", cor)}
              style={{ width: `${(d.valor / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const [chamadosAbertos, chamadoMaisAntigo, semResponsavel, resolvidos7d] =
    await Promise.all([
      prisma.chamado.count({ where: { status: { in: STATUS_ABERTOS } } }),
      prisma.chamado.findFirst({
        where: { status: { in: STATUS_ABERTOS } },
        orderBy: { criadoEm: "asc" },
        select: { numero: true, titulo: true, criadoEm: true },
      }),
      prisma.chamado.count({
        where: { status: { in: STATUS_ABERTOS }, responsavelId: null },
      }),
      prisma.chamado.count({
        where: {
          resolvidoEm: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  const [computadores, celulares] = await Promise.all([
    prisma.computador.findMany({
      include: {
        funcionario: true,
        sala: true,
        componentes: { include: { tipo: true } },
      },
    }),
    prisma.celular.findMany({ include: { funcionario: true } }),
  ]);

  const total = computadores.length;
  const semFuncionario = computadores.filter((c) => !c.funcionario).length;
  const emUso = total - semFuncionario;

  const totalCelulares = celulares.length;
  const celularesSemFunc = celulares.filter((c) => !c.funcionario).length;

  const porCargo = new Map<string, number>();
  for (const c of computadores) {
    const cargo = c.funcionario?.cargo ?? "Sem funcionário (estoque)";
    porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + 1);
  }

  const porSala = new Map<string, number>();
  for (const c of computadores) {
    const sala = c.sala?.nome ?? "Sem sala definida";
    porSala.set(sala, (porSala.get(sala) ?? 0) + 1);
  }

  const porTipo = new Map<string, number>();
  for (const c of computadores) {
    for (const comp of c.componentes) {
      porTipo.set(comp.tipo.nome, (porTipo.get(comp.tipo.nome) ?? 0) + 1);
    }
  }

  const cargoData = [...porCargo.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);
  const salaData = [...porSala.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);
  const tipoData = [...porTipo.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);

  // Ciclo de vida: o que exige uma decisão do TI nas próximas semanas.
  const limiteGarantia = new Date(
    Date.now() + DIAS_AVISO_GARANTIA * 24 * 60 * 60 * 1000,
  );
  const emManutencao = [...computadores, ...celulares].filter(
    (e) => e.situacao === "manutencao",
  ).length;
  const descartados = [...computadores, ...celulares].filter(
    (e) => e.situacao === "descartado",
  ).length;
  const garantiaVencendo = [...computadores, ...celulares].filter(
    (e) =>
      e.garantiaAte &&
      e.garantiaAte <= limiteGarantia &&
      e.garantiaAte >= new Date() &&
      e.situacao !== "descartado",
  ).length;

  // Pendências de licença/conta: quantos computadores estão sem cada item.
  const pendencias = [
    {
      label: "Sem sala definida",
      valor: computadores.filter((c) => !c.salaId).length,
    },
    {
      label: "Sem licença Windows",
      valor: computadores.filter((c) => !c.licencaWindows).length,
    },
    {
      label: "Sem licença Microsoft / Office",
      valor: computadores.filter((c) => !c.licencaMicrosoft).length,
    },
    {
      label: "Sem conta Outlook",
      valor: computadores.filter((c) => !c.contaOutlook).length,
    },
    {
      label: "Sem login padrão",
      valor: computadores.filter((c) => !c.loginPadrao).length,
    },
    {
      label: "Sem headset",
      valor: computadores.filter((c) => !c.temHeadset).length,
    },
  ];

  const kpis = [
    { titulo: "Total de computadores", valor: total, icon: Monitor },
    { titulo: "Computadores em uso", valor: emUso, icon: Users },
    { titulo: "Total de celulares", valor: totalCelulares, icon: Smartphone },
    {
      titulo: "Em estoque (PCs + celulares)",
      valor: semFuncionario + celularesSemFunc,
      icon: PackageOpen,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">painel</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do parque de hardware. O Excel reflete exatamente estes
            dados.
          </p>
        </div>
        <ExportButton />
      </div>

      {/* Suporte vem primeiro: é o que pede ação hoje. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">suporte</h2>
          <Link
            href="/chamados"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ver fila de chamados →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/chamados" className="focus-visible:outline-none">
            <Card
              className={cn(
                "relative h-full overflow-hidden transition-shadow hover:shadow-md",
                chamadosAbertos > 0 && "border-amber-300",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5",
                  chamadosAbertos > 0 ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Chamados em aberto
                  </span>
                  <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                </div>
                <div
                  className={cn(
                    "mt-2 font-display text-3xl font-bold tabular-nums",
                    chamadosAbertos > 0 ? "text-amber-600" : "text-emerald-600",
                  )}
                >
                  {chamadosAbertos}
                </div>
                {chamadoMaisAntigo && (
                  <div className="eyebrow mt-1 flex items-center gap-1">
                    <AlarmClock className="h-3 w-3" />
                    mais antigo: #{chamadoMaisAntigo.numero}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Card className="relative overflow-hidden">
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-0.5",
                semResponsavel > 0 ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Sem responsável
                </span>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </div>
              <div
                className={cn(
                  "mt-2 font-display text-3xl font-bold tabular-nums",
                  semResponsavel > 0 ? "text-amber-600" : "text-emerald-600",
                )}
              >
                {semResponsavel}
              </div>
              <div className="eyebrow mt-1">
                {semResponsavel > 0 ? "esperando alguém assumir" : "fila coberta"}
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden">
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500" />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Resolvidos (7 dias)
                </span>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">
                {resolvidos7d}
              </div>
              <div className="eyebrow mt-1">na última semana</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Ciclo de vida: só aparece quando há algo a decidir. */}
      {(emManutencao > 0 || garantiaVencendo > 0 || descartados > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">ciclo de vida</h2>
            <Link
              href="/manutencoes"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ver manutenções →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/manutencoes" className="focus-visible:outline-none">
              <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 bg-amber-500"
                />
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      No conserto
                    </span>
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tabular-nums text-amber-600">
                    {emManutencao}
                  </div>
                  <div className="eyebrow mt-1">equipamentos parados</div>
                </CardContent>
              </Card>
            </Link>
            <Card className="relative overflow-hidden">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-amber-500"
              />
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Garantia acabando
                  </span>
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 font-display text-3xl font-bold tabular-nums text-amber-600">
                  {garantiaVencendo}
                </div>
                <div className="eyebrow mt-1">
                  nos próximos {DIAS_AVISO_GARANTIA} dias
                </div>
              </CardContent>
            </Card>
            <Card className="relative overflow-hidden">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-0.5 bg-muted-foreground/40"
              />
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Descartados
                  </span>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 font-display text-3xl font-bold tabular-nums text-muted-foreground">
                  {descartados}
                </div>
                <div className="eyebrow mt-1">fora do parque</div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <h2 className="eyebrow">parque de equipamentos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.titulo} className="relative overflow-hidden">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 bg-primary"
            />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {k.titulo}
                </span>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">
                {k.valor}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Computadores por cargo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={cargoData} cor="bg-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Computadores por sala
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={salaData} cor="bg-violet-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Componentes por tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={tipoData} cor="bg-emerald-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">
            Pendências de licença / conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendencias.map((p) => {
              const ok = p.valor === 0;
              return (
                <div
                  key={p.label}
                  className={cn(
                    "rounded-md border p-3",
                    ok ? "border-border" : "border-amber-300 bg-amber-50/50",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "led",
                        ok ? "text-emerald-500" : "text-amber-500",
                      )}
                    />
                    <div className="text-xs text-muted-foreground">
                      {p.label}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-display text-2xl font-bold tabular-nums",
                      ok ? "text-emerald-600" : "text-amber-600",
                    )}
                  >
                    {p.valor}
                  </div>
                  <div className="eyebrow">
                    {total === 0
                      ? "—"
                      : ok
                        ? "tudo registrado"
                        : `de ${total} PCs`}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
