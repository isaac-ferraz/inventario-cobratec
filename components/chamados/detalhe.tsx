"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  DoorOpen,
  Loader2,
  Lock,
  Monitor,
  Send,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRIORIDADES,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  STATUS,
} from "@/lib/chamados";
import { cn } from "@/lib/utils";
import { PrioridadeBadge, StatusBadge, dataHora } from "./badges";
import type { ChamadoDetalhe, UsuarioResumo } from "./types";

const SEM_RESP = "__sem__";

type Props = {
  chamadoId: string;
  papel: "ADMIN" | "OPERADOR";
  usuarioId: string;
};

export function DetalheChamado({ chamadoId, papel, usuarioId }: Props) {
  const admin = papel === "ADMIN";
  const [chamado, setChamado] = React.useState<ChamadoDetalhe | null>(null);
  const [admins, setAdmins] = React.useState<UsuarioResumo[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [corpo, setCorpo] = React.useState("");
  const [interna, setInterna] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [acaoErro, setAcaoErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      setCarregaErro(null);
      try {
        setChamado(await apiGet<ChamadoDetalhe>(`/api/chamados/${chamadoId}`));
      } catch (e) {
        setCarregaErro(mensagem(e));
      } finally {
        setCarregando(false);
      }
    },
    [chamadoId],
  );

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  // A lista de administradores só interessa a quem atribui responsável.
  React.useEffect(() => {
    if (!admin) return;
    apiGet<(UsuarioResumo & { papel: string; ativo: boolean })[]>("/api/usuarios")
      .then((us) => setAdmins(us.filter((u) => u.papel === "ADMIN" && u.ativo)))
      .catch(() => setAdmins([]));
  }, [admin]);

  async function atualizar(dados: Record<string, unknown>) {
    setSalvando(true);
    setAcaoErro(null);
    try {
      await apiSend(`/api/chamados/${chamadoId}`, "PATCH", dados);
      await carregar(true);
    } catch (e) {
      setAcaoErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  async function responder() {
    if (!corpo.trim()) return;
    setEnviando(true);
    setAcaoErro(null);
    try {
      await apiSend(`/api/chamados/${chamadoId}/mensagens`, "POST", {
        corpo,
        interna,
      });
      setCorpo("");
      setInterna(false);
      await carregar(true);
    } catch (e) {
      setAcaoErro(mensagem(e));
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando chamado...
      </div>
    );
  }

  if (carregaErro || !chamado) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {carregaErro ?? "Chamado não encontrado."}
        </p>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/chamados">Voltar para os chamados</Link>
        </Button>
      </div>
    );
  }

  const meu = chamado.solicitanteId === usuarioId;
  const encerrado = chamado.status === "fechado";

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/chamados">
            <ArrowLeft /> Todos os chamados
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">chamado #{chamado.numero}</div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {chamado.titulo}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PrioridadeBadge prioridade={chamado.prioridade} />
            <StatusBadge status={chamado.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {/* Pedido original */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">
                {chamado.solicitante.nome}
                {chamado.solicitante.funcionario && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {chamado.solicitante.funcionario.cargo}
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {dataHora(chamado.criadoEm)}
              </p>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{chamado.descricao}</p>
            </CardContent>
          </Card>

          {/* Conversa */}
          <section className="space-y-3">
            <h2 className="eyebrow">conversa · {chamado.mensagens.length}</h2>
            {chamado.mensagens.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta ainda.
              </p>
            ) : (
              <ul className="space-y-3">
                {chamado.mensagens.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "rounded-md border p-3",
                      m.interna
                        ? "border-dashed border-amber-300 bg-amber-50/50"
                        : m.autor.papel === "ADMIN"
                          ? "border-primary/30 bg-primary/5"
                          : "bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{m.autor.nome}</span>
                      {m.autor.papel === "ADMIN" && (
                        <Badge variant="secondary">TI</Badge>
                      )}
                      {m.interna && (
                        <Badge variant="warning">
                          <Lock className="mr-1 h-3 w-3" /> nota interna
                        </Badge>
                      )}
                      <span className="ml-auto text-muted-foreground">
                        {dataHora(m.criadoEm)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{m.corpo}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Responder */}
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="resposta">
                  {admin ? "Responder ou anotar" : "Responder"}
                </Label>
                <Textarea
                  id="resposta"
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  rows={3}
                  placeholder={
                    encerrado
                      ? "Este chamado está fechado — responder o reabre pelo TI."
                      : "Escreva sua mensagem..."
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {admin && (
                  <Button
                    type="button"
                    size="sm"
                    variant={interna ? "default" : "outline"}
                    aria-pressed={interna}
                    onClick={() => setInterna((v) => !v)}
                    title="A nota interna não é vista pelo solicitante"
                  >
                    <Lock /> {interna ? "Nota interna" : "Visível ao solicitante"}
                  </Button>
                )}
                <Button
                  onClick={responder}
                  disabled={enviando || !corpo.trim()}
                  className="ml-auto"
                >
                  {enviando ? <Loader2 className="animate-spin" /> : <Send />}
                  Enviar
                </Button>
              </div>
              {interna && admin && (
                <p className="text-xs text-amber-700">
                  Só administradores verão esta mensagem.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel lateral: contexto e ações */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Contexto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {chamado.categoria && (
                <div>
                  <div className="eyebrow">tipo</div>
                  <div>{chamado.categoria}</div>
                </div>
              )}
              {chamado.sala && (
                <div>
                  <div className="eyebrow">sala</div>
                  <Link
                    href={`/salas/${chamado.sala.id}`}
                    className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  >
                    <DoorOpen className="h-3.5 w-3.5" /> {chamado.sala.nome}
                  </Link>
                </div>
              )}
              {chamado.computador && (
                <div>
                  <div className="eyebrow">computador</div>
                  <div className="inline-flex items-center gap-1 font-mono text-xs">
                    <Monitor className="h-3.5 w-3.5" />
                    {chamado.computador.identificador}
                  </div>
                </div>
              )}
              {chamado.celular && (
                <div>
                  <div className="eyebrow">celular</div>
                  <div className="inline-flex items-center gap-1 font-mono text-xs">
                    <Smartphone className="h-3.5 w-3.5" />
                    {chamado.celular.identificador}
                  </div>
                </div>
              )}
              <div>
                <div className="eyebrow">responsável</div>
                {chamado.responsavel ? (
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5" />
                    {chamado.responsavel.nome}
                  </span>
                ) : (
                  <span className="text-muted-foreground">ninguém ainda</span>
                )}
              </div>
              {chamado.resolvidoEm && (
                <div>
                  <div className="eyebrow">resolvido em</div>
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    {dataHora(chamado.resolvidoEm)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {admin ? (
                <>
                  {!chamado.responsavel && (
                    <Button
                      className="w-full"
                      disabled={salvando}
                      onClick={() =>
                        atualizar({ responsavelId: usuarioId, status: "em_andamento" })
                      }
                    >
                      <UserCheck /> Assumir chamado
                    </Button>
                  )}
                  <div className="space-y-1.5">
                    <Label>Situação</Label>
                    <Select
                      value={chamado.status}
                      onValueChange={(v) => atualizar({ status: v })}
                      disabled={salvando}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {ROTULO_STATUS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <Select
                      value={chamado.prioridade}
                      onValueChange={(v) => atualizar({ prioridade: v })}
                      disabled={salvando}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORIDADES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {ROTULO_PRIORIDADE[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Responsável</Label>
                    <Select
                      value={chamado.responsavel?.id ?? SEM_RESP}
                      onValueChange={(v) =>
                        atualizar({ responsavelId: v === SEM_RESP ? "" : v })
                      }
                      disabled={salvando}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_RESP}>— Sem responsável —</SelectItem>
                        {admins.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  {/* O operador não gerencia a fila: só confirma ou reabre. */}
                  {meu && chamado.status === "resolvido" && (
                    <>
                      <Button
                        className="w-full"
                        disabled={salvando}
                        onClick={() => atualizar({ status: "fechado" })}
                      >
                        Resolveu, pode fechar
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={salvando}
                        onClick={() => atualizar({ status: "aberto" })}
                      >
                        Não resolveu — reabrir
                      </Button>
                    </>
                  )}
                  {meu && chamado.status === "fechado" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={salvando}
                      onClick={() => atualizar({ status: "aberto" })}
                    >
                      Voltou a acontecer — reabrir
                    </Button>
                  )}
                  {!["resolvido", "fechado"].includes(chamado.status) && (
                    <p className="text-sm text-muted-foreground">
                      O TI está com o seu chamado. Se tiver mais informações,
                      escreva na conversa.
                    </p>
                  )}
                </>
              )}
              {salvando && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> salvando...
                </p>
              )}
              {acaoErro && <p className="text-sm text-destructive">{acaoErro}</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
