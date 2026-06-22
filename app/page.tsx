// Dashboard — indicadores principais do inventário (mesma base do Excel).
import { Monitor, Users, PackageOpen, Smartphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
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
  const [computadores, celulares] = await Promise.all([
    prisma.computador.findMany({
      include: { funcionario: true, componentes: { include: { tipo: true } } },
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

  const porTipo = new Map<string, number>();
  for (const c of computadores) {
    for (const comp of c.componentes) {
      porTipo.set(comp.tipo.nome, (porTipo.get(comp.tipo.nome) ?? 0) + 1);
    }
  }

  const cargoData = [...porCargo.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);
  const tipoData = [...porTipo.entries()]
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor);

  // Pendências de licença/conta: quantos computadores estão sem cada item.
  const pendencias = [
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
