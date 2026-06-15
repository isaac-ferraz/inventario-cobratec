// Dashboard — indicadores principais do inventário (mesma base do Excel).
import { Monitor, Users, PackageOpen, Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";

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
    <div className="space-y-2">
      {dados.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{d.label}</span>
            <span className="font-medium tabular-nums">{d.valor}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cor}
              style={{ width: `${(d.valor / max) * 100}%`, height: "100%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const computadores = await prisma.computador.findMany({
    include: { funcionario: true, componentes: { include: { tipo: true } } },
  });

  const total = computadores.length;
  const semFuncionario = computadores.filter((c) => !c.funcionario).length;
  const emUso = total - semFuncionario;

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
  ];

  const kpis = [
    { titulo: "Total de computadores", valor: total, icon: Monitor },
    { titulo: "Em uso", valor: emUso, icon: Users },
    { titulo: "Sem funcionário / estoque", valor: semFuncionario, icon: PackageOpen },
    { titulo: "Tipos de componente", valor: porTipo.size, icon: Layers },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do parque de hardware. O Excel reflete exatamente estes
            dados.
          </p>
        </div>
        <ExportButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.titulo}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.titulo}
              </CardTitle>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{k.valor}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Computadores por cargo</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={cargoData} cor="bg-blue-600" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Componentes por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={tipoData} cor="bg-emerald-600" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendências de licença / conta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pendencias.map((p) => (
              <div
                key={p.label}
                className="rounded-lg border p-3"
                data-ok={p.valor === 0}
              >
                <div className="text-sm text-muted-foreground">{p.label}</div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    p.valor === 0 ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {p.valor}
                </div>
                <div className="text-xs text-muted-foreground">
                  {total === 0
                    ? "—"
                    : p.valor === 0
                      ? "tudo registrado"
                      : `de ${total} computador(es)`}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
