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
import { contarPendencias } from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Rótulos que não são cargo/sala de verdade — viram recortes da lista, não
// filtros por nome.
const SEM_DONO = "Sem funcionário (estoque)";
const SEM_SALA = "Sem sala definida";

// Cada barra leva para a lista daquele recorte — o número por si só não responde
// "quais?", que é sempre a pergunta seguinte.
type Barra = { label: string; valor: number; href?: string };

function BarList({ dados, cor }: { dados: Barra[]; cor: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados ainda.</p>;
  }
  return (
    <div className="space-y-2.5">
      {dados.map((d) => {
        const conteudo = (
          <>
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
          </>
        );
        return d.href ? (
          <Link
            key={d.label}
            href={d.href}
            title={`Ver os ${d.valor} computador(es): ${d.label}`}
            className="block rounded-sm px-1 py-0.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {conteudo}
          </Link>
        ) : (
          <div key={d.label} className="px-1 py-0.5">
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}

// KPI clicável. O href é obrigatório de propósito: um card que não leva a lugar
// nenhum é o problema que esta tela tinha.
function Kpi({
  titulo,
  valor,
  href,
  Icone,
  rodape,
  tom = "neutro",
}: {
  titulo: string;
  valor: number;
  href: string;
  Icone: typeof Monitor;
  rodape?: React.ReactNode;
  tom?: "neutro" | "alerta" | "ok" | "apagado";
}) {
  return (
    <Link
      href={href}
      title={`${titulo}: ver a lista`}
      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="relative h-full overflow-hidden transition-shadow hover:shadow-md">
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-0 h-0.5",
            tom === "alerta"
              ? "bg-amber-500"
              : tom === "ok"
                ? "bg-emerald-500"
                : tom === "apagado"
                  ? "bg-muted-foreground/40"
                  : "bg-primary",
          )}
        />
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{titulo}</span>
            <Icone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div
            className={cn(
              "mt-2 font-display text-3xl font-bold tabular-nums",
              tom === "alerta" && "num-alerta",
              tom === "ok" && "num-ok",
              tom === "apagado" && "text-muted-foreground",
            )}
          >
            {valor}
          </div>
          {rodape && <div className="eyebrow mt-1">{rodape}</div>}
        </CardContent>
      </Card>
    </Link>
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
    const cargo = c.funcionario?.cargo ?? SEM_DONO;
    porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + 1);
  }

  // O id da sala é guardado junto com o nome porque a barra vira link para a
  // página da sala — e o agrupamento é por nome.
  const porSala = new Map<string, number>();
  const salaIdPorNome = new Map<string, string>();
  for (const c of computadores) {
    const sala = c.sala?.nome ?? SEM_SALA;
    if (c.sala) salaIdPorNome.set(c.sala.nome, c.sala.id);
    porSala.set(sala, (porSala.get(sala) ?? 0) + 1);
  }

  // Idem para o tipo de componente: o filtro da lista é por id, não por nome.
  const porTipo = new Map<string, { valor: number; id: string }>();
  for (const c of computadores) {
    for (const comp of c.componentes) {
      const atual = porTipo.get(comp.tipo.nome);
      porTipo.set(comp.tipo.nome, {
        valor: (atual?.valor ?? 0) + 1,
        id: comp.tipo.id,
      });
    }
  }

  const cargoData: Barra[] = [...porCargo.entries()]
    .map(([label, valor]) => ({
      label,
      valor,
      // "Sem funcionário (estoque)" não é um cargo: vai para o filtro de dono.
      href:
        label === SEM_DONO
          ? "/computadores?funcionario=sem"
          : `/computadores?cargo=${encodeURIComponent(label)}`,
    }))
    .sort((a, b) => b.valor - a.valor);

  const salaData: Barra[] = [...porSala.entries()]
    .map(([label, valor]) => ({
      label,
      valor,
      // Sala de verdade tem página própria; "sem sala" é um recorte da lista.
      href: salaIdPorNome.has(label)
        ? `/salas/${salaIdPorNome.get(label)}`
        : "/computadores?sala=sem",
    }))
    .sort((a, b) => b.valor - a.valor);

  const tipoData: Barra[] = [...porTipo.entries()]
    .map(([label, { valor, id }]) => ({
      label,
      valor,
      href: `/computadores?tipo=${id}`,
    }))
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

  // Pendências: a contagem vem do MESMO catálogo que a lista usa para filtrar
  // (lib/pendencias.ts). Se cada um tivesse a sua regra, o card diria "7" e o
  // clique abriria 6.
  const pendencias = contarPendencias(computadores);

  // "Em estoque" mistura PCs e celulares, que moram em telas diferentes — o
  // clique leva aos computadores, que é a maioria do parque.
  const kpis = [
    {
      titulo: "Total de computadores",
      valor: total,
      icon: Monitor,
      href: "/computadores",
    },
    {
      titulo: "Computadores em uso",
      valor: emUso,
      icon: Users,
      href: "/computadores?funcionario=com",
    },
    {
      titulo: "Total de celulares",
      valor: totalCelulares,
      icon: Smartphone,
      href: "/celulares",
    },
    {
      titulo: "Em estoque (PCs + celulares)",
      valor: semFuncionario + celularesSemFunc,
      icon: PackageOpen,
      href: "/computadores?funcionario=sem",
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
          <Kpi
            titulo="Chamados em aberto"
            valor={chamadosAbertos}
            href="/chamados?status=abertos"
            Icone={LifeBuoy}
            tom={chamadosAbertos > 0 ? "alerta" : "ok"}
            rodape={
              chamadoMaisAntigo && (
                <span className="flex items-center gap-1">
                  <AlarmClock className="h-3 w-3" />
                  mais antigo: #{chamadoMaisAntigo.numero}
                </span>
              )
            }
          />
          <Kpi
            titulo="Sem responsável"
            valor={semResponsavel}
            href="/chamados?status=abertos&responsavel=sem"
            Icone={UserX}
            tom={semResponsavel > 0 ? "alerta" : "ok"}
            rodape={
              semResponsavel > 0 ? "esperando alguém assumir" : "fila coberta"
            }
          />
          <Kpi
            titulo="Resolvidos (7 dias)"
            valor={resolvidos7d}
            href="/chamados?status=resolvido"
            Icone={CheckCircle2}
            tom="ok"
            rodape="na última semana"
          />
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
            <Kpi
              titulo="No conserto"
              valor={emManutencao}
              href="/manutencoes?situacao=abertas"
              Icone={Wrench}
              tom="alerta"
              rodape="equipamentos parados"
            />
            <Kpi
              titulo="Garantia acabando"
              valor={garantiaVencendo}
              href="/computadores?garantia=vencendo"
              Icone={ShieldAlert}
              tom="alerta"
              rodape={`nos próximos ${DIAS_AVISO_GARANTIA} dias`}
            />
            <Kpi
              titulo="Descartados"
              valor={descartados}
              href="/computadores?situacao=descartado"
              Icone={Trash2}
              tom="apagado"
              rodape="fora do parque"
            />
          </div>
        </section>
      )}

      <h2 className="eyebrow">parque de equipamentos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Kpi
            key={k.titulo}
            titulo={k.titulo}
            valor={k.valor}
            href={k.href}
            Icone={k.icon}
          />
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
              const conteudo = (
                <>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "led",
                        ok ? "text-emerald-500" : "text-amber-500",
                      )}
                    />
                    <div className="text-xs text-muted-foreground">
                      {p.rotulo}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-1 font-display text-2xl font-bold tabular-nums",
                      ok ? "num-ok" : "num-alerta",
                    )}
                  >
                    {p.valor}
                  </div>
                  <div className="eyebrow">
                    {total === 0
                      ? "—"
                      : ok
                        ? "tudo registrado"
                        : `de ${total} PCs · ver quais →`}
                  </div>
                </>
              );

              // Zero não vira link: não há lista para abrir, e um card clicável
              // que abre o vazio frustra mais do que ajuda.
              return ok ? (
                <div key={p.chave} className="rounded-md border border-border p-3">
                  {conteudo}
                </div>
              ) : (
                <Link
                  key={p.chave}
                  href={`/computadores?pendencia=${p.chave}`}
                  title={`Ver os ${p.valor} computador(es): ${p.rotulo.toLowerCase()}`}
                  className="rounded-md border border-amber-300 bg-amber-50/50 p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-800/60 dark:bg-amber-950/40"
                >
                  {conteudo}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
