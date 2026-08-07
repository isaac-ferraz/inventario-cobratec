"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Wrench,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
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
import {
  ROTULO_TIPO_MANUTENCAO,
  formatarMoeda,
  somarCustos,
} from "@/lib/ativos";
import { cn } from "@/lib/utils";
import { ManutencaoDialog } from "@/components/manutencoes/manutencao-dialog";
import type { Manutencao } from "@/components/manutencoes/types";

function data(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export default function ManutencoesPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [lista, setLista] = React.useState<Manutencao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState("abertas");
  const [dialog, setDialog] = React.useState<{
    aberto: boolean;
    manutencao: Manutencao | null;
  }>({ aberto: false, manutencao: null });
  const [ocupadoId, setOcupadoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setCarregaErro(null);
    const q = filtro === "todas" ? "" : `?situacao=${filtro}`;
    try {
      setLista(await apiGet<Manutencao[]>(`/api/manutencoes${q}`));
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function concluir(m: Manutencao) {
    setOcupadoId(m.id);
    try {
      await apiSend(`/api/manutencoes/${m.id}`, "PATCH", {
        concluidaEm: new Date().toISOString().slice(0, 10),
      });
      toast({ descricao: "Manutenção concluída.", variante: "sucesso" });
      carregar();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setOcupadoId(null);
    }
  }

  async function remover(m: Manutencao) {
    const equip = m.computador?.identificador ?? m.celular?.identificador ?? "";
    const ok = await confirmar({
      titulo: `Remover este registro de manutenção de "${equip}"?`,
      descricao: m.concluidaEm ? undefined : "O equipamento volta para “Ativo”.",
      confirmar: "Remover",
    });
    if (!ok) return;
    setOcupadoId(m.id);
    try {
      await apiSend(`/api/manutencoes/${m.id}`, "DELETE");
      toast({ descricao: "Registro de manutenção removido.", variante: "sucesso" });
      carregar();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setOcupadoId(null);
    }
  }

  const emAberto = lista.filter((m) => !m.concluidaEm);
  const custoTotal = somarCustos(lista);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">ciclo de vida</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Wrench className="h-6 w-6 text-primary" /> Manutenções
          </h1>
          <p className="text-sm text-muted-foreground">
            Idas ao conserto e revisões. Enquanto uma manutenção está aberta, o
            equipamento fica marcado como “Em manutenção”.
          </p>
        </div>
        <Button onClick={() => setDialog({ aberto: true, manutencao: null })}>
          <Plus /> Abrir manutenção
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label>Situação</Label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abertas">No conserto</SelectItem>
                <SelectItem value="concluidas">Concluídas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-6 text-sm">
            <div>
              <div className="eyebrow">no conserto</div>
              <div className="font-display text-xl font-bold tabular-nums">
                {emAberto.length}
              </div>
            </div>
            <div>
              <div className="eyebrow">custo somado</div>
              <div className="font-display text-xl font-bold tabular-nums">
                {formatarMoeda(custoTotal)}
              </div>
            </div>
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
          <CardContent className="py-10 text-center">
            <p className="font-medium">
              {filtro === "abertas"
                ? "Nenhum equipamento no conserto."
                : "Nenhuma manutenção registrada."}
            </p>
            <p className="text-sm text-muted-foreground">
              Use “Abrir manutenção” quando mandar um equipamento para conserto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lista.map((m) => {
            const equip = m.computador ?? m.celular;
            const noConserto = !m.concluidaEm;
            return (
              <li key={m.id}>
                <article className="relative overflow-hidden rounded-md border bg-card p-4 pl-5 shadow-sm">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 w-1",
                      noConserto ? "bg-amber-500" : "bg-emerald-500",
                    )}
                  />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="eyebrow flex items-center gap-1">
                        {m.computador ? (
                          <Monitor className="h-3 w-3" />
                        ) : (
                          <Smartphone className="h-3 w-3" />
                        )}
                        {equip?.identificador ?? "equipamento removido"}
                      </div>
                      <h3 className="font-display text-base font-semibold tracking-tight">
                        {m.descricao}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {ROTULO_TIPO_MANUTENCAO[m.tipo]}
                      </Badge>
                      {noConserto ? (
                        <Badge variant="warning">No conserto</Badge>
                      ) : (
                        <Badge variant="success">Concluída</Badge>
                      )}
                    </div>
                  </div>

                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>aberta em {data(m.abertaEm)}</span>
                    {m.concluidaEm && <span>concluída em {data(m.concluidaEm)}</span>}
                    {m.fornecedor && <span>· {m.fornecedor}</span>}
                    {m.custo != null && <span>· {formatarMoeda(m.custo)}</span>}
                    {m.chamado && (
                      <Link
                        href={`/chamados/${m.chamado.id}`}
                        className="underline-offset-2 hover:text-foreground hover:underline"
                      >
                        · do chamado #{m.chamado.numero}
                      </Link>
                    )}
                  </dl>

                  {m.observacoes && (
                    <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      {m.observacoes}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {noConserto && (
                      <Button
                        size="sm"
                        disabled={ocupadoId === m.id}
                        onClick={() => concluir(m)}
                      >
                        {ocupadoId === m.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCircle2 />
                        )}
                        Concluir
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ aberto: true, manutencao: m })}
                    >
                      <Pencil /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupadoId === m.id}
                      onClick={() => remover(m)}
                    >
                      <Trash2 className="text-destructive" /> Remover
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <ManutencaoDialog
        aberto={dialog.aberto}
        onOpenChange={(v) => setDialog((s) => ({ ...s, aberto: v }))}
        manutencao={dialog.manutencao}
        onSalvo={carregar}
      />
    </div>
  );
}
