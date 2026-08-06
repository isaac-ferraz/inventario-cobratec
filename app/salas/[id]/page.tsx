"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DoorOpen,
  Loader2,
  LogOut,
  Monitor,
  PackageOpen,
  Plus,
  Smartphone,
  TriangleAlert,
  User,
  Users,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrazerDialog } from "@/components/salas/trazer-dialog";
import type { DetalheSala, SalaResumo } from "@/components/salas/types";
import { cn } from "@/lib/utils";

// Valor sentinela: o Radix Select não aceita item com value "".
const TIRAR = "__tirar__";

export default function SalaPage({ params }: { params: { id: string } }) {
  const [dados, setDados] = React.useState<DetalheSala | null>(null);
  const [salas, setSalas] = React.useState<SalaResumo[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [selPcs, setSelPcs] = React.useState<Set<string>>(new Set());
  const [selFuncs, setSelFuncs] = React.useState<Set<string>>(new Set());
  const [movendo, setMovendo] = React.useState(false);
  const [erroAcao, setErroAcao] = React.useState<string | null>(null);
  const [trazerAberto, setTrazerAberto] = React.useState(false);

  // `silencioso` mantém o conteúdo na tela enquanto recarrega. Depois de mover
  // um item, trocar a página inteira pelo spinner faria tudo piscar e perder a
  // posição do scroll — o indicador da própria ação já sinaliza o progresso.
  const carregar = React.useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setCarregaErro(null);
    try {
      const [d, s] = await Promise.all([
        apiGet<DetalheSala>(`/api/salas/${params.id}`),
        apiGet<SalaResumo[]>("/api/salas"),
      ]);
      setDados(d);
      setSalas(s);
      setSelPcs(new Set());
      setSelFuncs(new Set());
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const recarregarSilencioso = React.useCallback(
    () => carregar(true),
    [carregar],
  );

  // Move a seleção (ou um item avulso) para outra sala — ou para fora de
  // qualquer sala, quando o destino é null.
  async function mover(
    destinoSalaId: string | null,
    alvo?: { computadorIds?: string[]; funcionarioIds?: string[] },
  ) {
    const computadorIds = alvo?.computadorIds ?? [...selPcs];
    const funcionarioIds = alvo?.funcionarioIds ?? [...selFuncs];
    if (computadorIds.length + funcionarioIds.length === 0) return;
    setMovendo(true);
    setErroAcao(null);
    try {
      await apiSend("/api/salas/mover", "POST", {
        destinoSalaId,
        computadorIds,
        funcionarioIds,
      });
      await carregar(true);
    } catch (e) {
      setErroAcao(mensagem(e));
    } finally {
      setMovendo(false);
    }
  }

  function alternar(set: Set<string>, id: string) {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando sala...
      </div>
    );
  }

  if (carregaErro || !dados) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {carregaErro ?? "Sala não encontrada."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => carregar()}>
            Tentar novamente
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/salas">Voltar para salas</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { sala, computadores, funcionarios } = dados;

  // Postos: cada funcionário desta sala com o que é dele. Os computadores dele
  // que ficaram em OUTRA sala aparecem aqui sinalizados — é justamente o tipo de
  // divergência que o TI precisa enxergar.
  const idsEmPostos = new Set(
    funcionarios.flatMap((f) => f.computadores.map((c) => c.id)),
  );
  // Máquinas fisicamente nesta sala que não pertencem a ninguém daqui:
  // estoque parado na sala ou PC de alguém que senta em outro lugar.
  const semPosto = computadores.filter((c) => !idsEmPostos.has(c.id));

  const totalCelulares = funcionarios.reduce(
    (n, f) => n + f.celulares.length,
    0,
  );
  const selecionados = selPcs.size + selFuncs.size;
  const outrasSalas = salas.filter((s) => s.id !== sala.id && s.ativa);

  const kpis = [
    { titulo: "Funcionários", valor: funcionarios.length, icon: Users },
    { titulo: "Computadores", valor: computadores.length, icon: Monitor },
    { titulo: "Celulares", valor: totalCelulares, icon: Smartphone },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/salas">
            <ArrowLeft /> Todas as salas
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">sala</div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
              <DoorOpen className="h-6 w-6 text-primary" />
              {sala.nome}
              {!sala.ativa && <Badge variant="outline">desativada</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[sala.predio && `Prédio ${sala.predio}`, sala.piso]
                .filter(Boolean)
                .join(" · ") || "Sem prédio/piso definidos"}
            </p>
            {sala.observacoes && (
              <p className="mt-1 text-sm text-muted-foreground">
                {sala.observacoes}
              </p>
            )}
          </div>
          <Button onClick={() => setTrazerAberto(true)}>
            <Plus /> Trazer para esta sala
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.titulo} className="relative overflow-hidden">
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{k.titulo}</span>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">
                {k.valor}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Barra de ações em lote — só aparece com seleção ativa. */}
      {selecionados > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">
              {selecionados} selecionado(s)
            </span>
            <Select
              value=""
              onValueChange={(v) => mover(v === TIRAR ? null : v)}
              disabled={movendo}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Mover selecionados para..." />
              </SelectTrigger>
              <SelectContent>
                {outrasSalas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
                <SelectItem value={TIRAR}>— Tirar de qualquer sala —</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelPcs(new Set());
                setSelFuncs(new Set());
              }}
            >
              Limpar seleção
            </Button>
            {movendo && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> movendo...
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {erroAcao && <p className="text-sm text-destructive">{erroAcao}</p>}

      {/* Postos de trabalho: a pessoa e o conjunto dela */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Postos de trabalho
          </h2>
          <span className="eyebrow">{funcionarios.length} pessoa(s)</span>
        </div>

        {funcionarios.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nenhum funcionário nesta sala ainda. Use “Trazer para esta sala”
              para alocar as pessoas.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {funcionarios.map((f) => {
              const marcado = selFuncs.has(f.id);
              return (
                <article
                  key={f.id}
                  className={cn(
                    "relative overflow-hidden rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md",
                    marcado && "ring-2 ring-primary",
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1 bg-primary"
                  />
                  <div className="space-y-3 p-4 pl-5">
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex min-w-0 cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={marcado}
                          aria-label={`Selecionar ${f.nome}`}
                          onChange={() => setSelFuncs((s) => alternar(s, f.id))}
                        />
                        <span className="min-w-0">
                          <span className="eyebrow flex items-center gap-1">
                            <User className="h-3 w-3" /> posto
                          </span>
                          <span className="block truncate font-display text-lg font-semibold tracking-tight">
                            {f.nome}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {f.cargo}
                            {!f.ativo && " · inativo"}
                          </span>
                        </span>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Tirar desta sala (leva os computadores dele junto)"
                        disabled={movendo}
                        onClick={() => mover(null, { funcionarioIds: [f.id] })}
                      >
                        <LogOut /> Tirar
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="eyebrow">computadores</div>
                      {f.computadores.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Sem computador atribuído.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {f.computadores.map((c) => (
                            <li
                              key={c.id}
                              className="flex flex-wrap items-center gap-2 rounded border border-dashed bg-muted/30 px-2 py-1.5"
                            >
                              <span className="font-mono text-xs font-medium">
                                {c.identificador}
                              </span>
                              {c.apelido && (
                                <span className="truncate text-xs text-muted-foreground">
                                  {c.apelido}
                                </span>
                              )}
                              {c.salaId !== sala.id && (
                                <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600">
                                  <TriangleAlert className="h-3 w-3" />
                                  {c.sala
                                    ? `está em ${c.sala.nome}`
                                    : "sem sala definida"}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="eyebrow">celulares</div>
                      {f.celulares.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Sem celular atribuído.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {f.celulares.map((cel) => (
                            <li
                              key={cel.id}
                              className="flex flex-wrap items-center gap-2 rounded border border-dashed bg-muted/30 px-2 py-1.5"
                            >
                              <Smartphone className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono text-xs font-medium">
                                {cel.identificador}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {[cel.apelido, cel.numero, cel.operadora]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Máquinas na sala que não pertencem a um posto daqui */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Computadores nesta sala sem posto
          </h2>
          <span className="eyebrow">{semPosto.length} máquina(s)</span>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Estoque parado aqui ou máquina cujo dono senta em outra sala.
            </CardTitle>
          </CardHeader>
          <CardContent>
            {semPosto.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma — toda máquina desta sala pertence a alguém daqui.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {semPosto.map((c) => {
                  const marcado = selPcs.has(c.id);
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 p-2",
                        marcado && "bg-muted",
                      )}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={marcado}
                          aria-label={`Selecionar ${c.identificador}`}
                          onChange={() => setSelPcs((s) => alternar(s, c.id))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm font-medium">
                            {c.identificador}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.apelido ? `${c.apelido} · ` : ""}
                            {c.componentes.length} componente(s)
                          </span>
                        </span>
                      </label>
                      {c.funcionario ? (
                        <Badge variant="secondary">
                          {c.funcionario.nome}
                          {c.funcionario.sala
                            ? ` · senta em ${c.funcionario.sala.nome}`
                            : " · sem sala"}
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <PackageOpen className="mr-1 h-3 w-3" /> Estoque
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Tirar desta sala"
                        disabled={movendo}
                        onClick={() => mover(null, { computadorIds: [c.id] })}
                      >
                        <LogOut /> Tirar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <TrazerDialog
        aberto={trazerAberto}
        onOpenChange={setTrazerAberto}
        salaId={sala.id}
        salaNome={sala.nome}
        onMovido={recarregarSilencioso}
      />
    </div>
  );
}
