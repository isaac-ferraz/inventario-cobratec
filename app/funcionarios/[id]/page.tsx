"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cpu,
  DoorOpen,
  Keyboard,
  Headphones,
  LifeBuoy,
  Loader2,
  Monitor,
  Mouse,
  PackageOpen,
  Smartphone,
  TriangleAlert,
  User,
} from "lucide-react";
import { apiGet, mensagem } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Credencial } from "@/components/ui/credencial";
import { GarantiaBadge, SituacaoBadge } from "@/components/ativos/badges";
import { StatusBadge, decorrido } from "@/components/chamados/badges";
import type { Prioridade, Status } from "@/lib/chamados";
import type { PerfilFuncionario } from "@/components/funcionarios/types";
import { cn } from "@/lib/utils";

export default function PerfilFuncionarioPage({
  params,
}: {
  params: { id: string };
}) {
  const [dados, setDados] = React.useState<PerfilFuncionario | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await apiGet<PerfilFuncionario>(`/api/funcionarios/${params.id}`));
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil...
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="space-y-3">
        <Link
          href="/funcionarios"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Funcionários
        </Link>
        <p className="text-sm text-destructive">
          {erro ?? "Funcionário não encontrado."}
        </p>
        <Button variant="outline" size="sm" onClick={carregar}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const f = dados;
  const temCredenciais =
    f.loginSiscobra || f.senhaSiscobra || f.loginVonix || f.senhaVonix;
  const chamadosAbertos = f.chamados.filter(
    (c) => c.status !== "fechado" && c.status !== "resolvido",
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href="/funcionarios"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Funcionários
      </Link>

      {/* Identificação */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">funcionário</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <User className="h-6 w-6 text-primary" />
            {f.nome}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{f.cargo}</Badge>
            {!f.ativo && <Badge variant="outline">inativo</Badge>}
            {f.sala ? (
              <Link
                href={`/salas/${f.sala.id}`}
                title={`Abrir a sala ${f.sala.nome}`}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge variant="outline" className="hover:bg-muted">
                  <DoorOpen className="mr-1 h-3 w-3" /> {f.sala.nome}
                </Badge>
              </Link>
            ) : (
              <Badge variant="warning">sem sala definida</Badge>
            )}
          </div>
        </div>
      </div>

      {/* O que está na mão da pessoa, de relance. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo
          rotulo="Computadores"
          valor={f.computadores.length}
          Icone={Monitor}
        />
        <Resumo rotulo="Celulares" valor={f.celulares.length} Icone={Smartphone} />
        <Resumo
          rotulo="Chamados em aberto"
          valor={chamadosAbertos}
          Icone={LifeBuoy}
          alerta={chamadosAbertos > 0}
        />
      </div>

      {temCredenciais && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Credenciais dos sistemas
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Credencial
              rotulo="Siscobra"
              login={f.loginSiscobra}
              senha={f.senhaSiscobra}
            />
            <Credencial
              rotulo="Vonix"
              login={f.loginVonix}
              senha={f.senhaVonix}
            />
          </CardContent>
        </Card>
      )}

      {/* Computadores com o hardware — o motivo de existir desta tela. */}
      <section className="space-y-3">
        <h2 className="eyebrow">computadores</h2>
        {f.computadores.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageOpen className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum computador com esta pessoa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {f.computadores.map((c) => {
              // Pessoa numa sala e máquina em outra: alguém mudou de lugar e
              // esqueceu de levar (ou de registrar) o equipamento.
              const divergente =
                c.salaId && f.salaId && c.salaId !== f.salaId;
              return (
                <article
                  key={c.id}
                  className="relative overflow-hidden rounded-md border bg-card p-4 pl-5 shadow-sm"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      c.situacao === "descartado"
                        ? "bg-muted-foreground/40"
                        : c.situacao === "manutencao"
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                  />
                  <div className="space-y-2.5">
                    <div>
                      <div className="eyebrow">patrimônio</div>
                      <h3 className="font-display text-lg font-semibold tracking-tight">
                        <Link
                          href={`/computadores?busca=${encodeURIComponent(c.identificador)}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {c.identificador}
                        </Link>
                      </h3>
                      {c.apelido && (
                        <p className="text-sm text-muted-foreground">{c.apelido}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <SituacaoBadge situacao={c.situacao} />
                      <GarantiaBadge garantiaAte={c.garantiaAte} />
                      {c.sala && (
                        <Link
                          href={`/salas/${c.sala.id}`}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Badge variant="outline" className="hover:bg-muted">
                            <DoorOpen className="mr-1 h-3 w-3" /> {c.sala.nome}
                          </Badge>
                        </Link>
                      )}
                      {divergente && (
                        <Badge variant="warning" title="A máquina está numa sala diferente da pessoa">
                          <TriangleAlert className="mr-1 h-3 w-3" /> sala diferente
                        </Badge>
                      )}
                    </div>

                    {/* Periféricos: o que falta é o que interessa. */}
                    <div className="flex flex-wrap gap-1.5">
                      <Periferico ok={c.temMouse} rotulo="mouse" Icone={Mouse} />
                      <Periferico ok={c.temTeclado} rotulo="teclado" Icone={Keyboard} />
                      <Periferico ok={c.temHeadset} rotulo="headset" Icone={Headphones} />
                    </div>

                    {c.componentes.length > 0 && (
                      <div>
                        <div className="eyebrow mb-1 flex items-center gap-1">
                          <Cpu className="h-3 w-3" /> hardware
                        </div>
                        <ul className="space-y-0.5 text-sm">
                          {c.componentes.map((comp) => (
                            <li key={comp.id} className="flex gap-2">
                              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
                                {comp.tipo.nome}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {comp.descricao}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(c.loginPadrao || c.contaOutlook) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {c.loginPadrao && (
                          <Credencial
                            rotulo="Acesso à máquina"
                            login={c.loginPadrao}
                            senha={c.senha}
                          />
                        )}
                        {c.contaOutlook && (
                          <Credencial
                            rotulo="Outlook"
                            login={c.contaOutlook}
                            senha={null}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {f.celulares.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">celulares</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {f.celulares.map((cel) => (
              <article
                key={cel.id}
                className="rounded-md border bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="eyebrow">patrimônio</div>
                    <h3 className="truncate font-display font-semibold">
                      <Link
                        href={`/celulares?busca=${encodeURIComponent(cel.identificador)}`}
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {cel.identificador}
                      </Link>
                    </h3>
                    {cel.apelido && (
                      <p className="truncate text-sm text-muted-foreground">
                        {cel.apelido}
                      </p>
                    )}
                  </div>
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cel.numero && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {cel.numero}
                    </Badge>
                  )}
                  {cel.operadora && (
                    <Badge variant="secondary">{cel.operadora}</Badge>
                  )}
                  <SituacaoBadge situacao={cel.situacao} />
                  <GarantiaBadge garantiaAte={cel.garantiaAte} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {f.chamados.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">chamados desta pessoa</h2>
            <Link
              href="/chamados"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ver fila completa →
            </Link>
          </div>
          <ul className="space-y-2">
            {f.chamados.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chamados/${c.id}`}
                  className="flex items-center gap-3 rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{c.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.titulo}
                  </span>
                  <StatusBadge status={c.status as Status} />
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {decorrido(c.criadoEm)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Resumo({
  rotulo,
  valor,
  Icone,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  Icone: typeof Monitor;
  alerta?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          alerta ? "bg-amber-500" : "bg-primary",
        )}
      />
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{rotulo}</span>
          <Icone className="h-4 w-4 text-muted-foreground" />
        </div>
        <div
          className={cn(
            "mt-2 font-display text-3xl font-bold tabular-nums",
            alerta && "num-alerta",
          )}
        >
          {valor}
        </div>
      </CardContent>
    </Card>
  );
}

// Periférico ausente é o que gera chamado — por isso o que falta fica marcado,
// e o que existe some no cinza.
function Periferico({
  ok,
  rotulo,
  Icone,
}: {
  ok: boolean;
  rotulo: string;
  Icone: typeof Mouse;
}) {
  return (
    <Badge variant={ok ? "outline" : "warning"}>
      <Icone className="mr-1 h-3 w-3" />
      {ok ? rotulo : `sem ${rotulo}`}
    </Badge>
  );
}
