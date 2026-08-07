"use client";

import * as React from "react";
import Link from "next/link";
import {
  Inbox,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Monitor,
  Plus,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { useListaPaginada } from "@/hooks/use-lista-paginada";
import { useFiltroUrl } from "@/hooks/use-filtro-url";
import type { Papel } from "@/lib/supervisao";
import { CarregarMais } from "@/components/ui/carregar-mais";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORIDADES, ROTULO_PRIORIDADE, ROTULO_STATUS, STATUS } from "@/lib/chamados";
import { cn } from "@/lib/utils";
import { AbrirChamadoDialog } from "./abrir-dialog";
import { PrioridadeBadge, StatusBadge, decorrido } from "./badges";
import type { ChamadoLista } from "./types";

type Props = { papel: Papel };

export function ListaChamados({ papel }: Props) {
  const admin = papel === "ADMIN";
  const [abrirDialog, setAbrirDialog] = React.useState(false);
  // O TI abre o dia querendo ver o que está pendente; o operador quer ver tudo
  // que já pediu.
  const [filtroStatus, setFiltroStatus] = useFiltroUrl(
    "status",
    admin ? "abertos" : "todos",
  );
  const [filtroPrioridade, setFiltroPrioridade] = useFiltroUrl("prioridade", "todas");
  // Só o admin gerencia fila; para o operador este filtro nem existe na API.
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroUrl("responsavel", "todos");

  const construirUrl = React.useCallback(
    (pagina: number) => {
      const params = new URLSearchParams({ pagina: String(pagina) });
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      if (filtroPrioridade !== "todas") params.set("prioridade", filtroPrioridade);
      if (admin && filtroResponsavel !== "todos") {
        params.set("responsavelId", filtroResponsavel);
      }
      return `/api/chamados?${params.toString()}`;
    },
    [filtroStatus, filtroPrioridade, filtroResponsavel, admin],
  );

  const {
    itens: lista,
    total,
    temMais,
    carregando,
    carregandoMais,
    erro: carregaErro,
    recarregar: carregar,
    carregarMais,
  } = useListaPaginada<ChamadoLista>(construirUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">suporte</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <LifeBuoy className="h-6 w-6 text-primary" /> Chamados
          </h1>
          <p className="text-sm text-muted-foreground">
            {admin
              ? "Fila de atendimento do TI. Assuma, responda e feche."
              : "Seus pedidos de suporte ao TI."}
          </p>
        </div>
        <Button onClick={() => setAbrirDialog(true)}>
          <Plus /> Abrir chamado
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abertos">Em aberto</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ROTULO_STATUS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {admin && (
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULO_PRIORIDADE[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {admin && (
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sem">— Sem responsável —</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {total} chamado(s)
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : carregaErro ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{carregaErro}</p>
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar novamente
          </Button>
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {filtroStatus === "abertos"
                ? "Nenhum chamado em aberto."
                : "Nenhum chamado por aqui."}
            </p>
            <p className="text-sm text-muted-foreground">
              {admin
                ? "A fila está limpa."
                : "Quando precisar do TI, use “Abrir chamado”."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lista.map((c) => (
            <li key={c.id}>
              <Link
                href={`/chamados/${c.id}`}
                className="block rounded-md border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <article className="relative overflow-hidden p-4 pl-5">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      c.status === "aberto"
                        ? "bg-amber-500"
                        : c.status === "em_andamento"
                          ? "bg-primary"
                          : c.status === "resolvido"
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/40",
                    )}
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="eyebrow">chamado #{c.numero}</div>
                      <h3 className="truncate font-display text-base font-semibold tracking-tight">
                        {c.titulo}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PrioridadeBadge prioridade={c.prioridade} />
                      <StatusBadge status={c.status} />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {admin && <span>{c.solicitante.nome}</span>}
                    {c.sala && <span>· {c.sala.nome}</span>}
                    {c.computador && (
                      <span className="inline-flex items-center gap-1">
                        <Monitor className="h-3 w-3" />
                        {c.computador.identificador}
                      </span>
                    )}
                    {c.celular && (
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="h-3 w-3" />
                        {c.celular.identificador}
                      </span>
                    )}
                    {c._count.mensagens > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {c._count.mensagens}
                      </span>
                    )}
                    <span className="ml-auto">aberto {decorrido(c.criadoEm)}</span>
                  </div>

                  {admin && (
                    <div className="mt-2">
                      {c.responsavel ? (
                        <Badge variant="secondary">
                          <UserCheck className="mr-1 h-3 w-3" />
                          {c.responsavel.nome}
                        </Badge>
                      ) : (
                        <Badge variant="warning">sem responsável</Badge>
                      )}
                    </div>
                  )}
                </article>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!carregando && !carregaErro && (
        <CarregarMais
          mostrando={lista.length}
          total={total}
          temMais={temMais}
          carregando={carregandoMais}
          onCarregarMais={carregarMais}
          rotulo="chamados"
        />
      )}

      <AbrirChamadoDialog
        aberto={abrirDialog}
        onOpenChange={setAbrirDialog}
        onCriado={carregar}
      />
    </div>
  );
}
