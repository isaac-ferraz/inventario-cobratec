"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  DoorOpen,
  Monitor,
  Users,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Sala = {
  id: string;
  nome: string;
  predio: string | null;
  piso: string | null;
  ordem: number;
  ativa: boolean;
  observacoes: string | null;
  _count: { computadores: number; funcionarios: number };
};

const VAZIO = {
  nome: "",
  predio: "",
  piso: "",
  ordem: "0",
  ativa: true,
  observacoes: "",
};

export default function SalasPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [lista, setLista] = React.useState<Sala[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Sala | null>(null);
  const [form, setForm] = React.useState(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      setLista(await apiGet<Sala[]>("/api/salas"));
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    carregar();
  }, []);

  function abrirNovo() {
    setEditando(null);
    // Sugere a próxima ordem para a sala nova cair no fim da lista.
    const proxima = lista.reduce((max, s) => Math.max(max, s.ordem), 0) + 1;
    setForm({ ...VAZIO, ordem: String(proxima) });
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(s: Sala) {
    setEditando(s);
    setForm({
      nome: s.nome,
      predio: s.predio ?? "",
      piso: s.piso ?? "",
      ordem: String(s.ordem),
      ativa: s.ativa,
      observacoes: s.observacoes ?? "",
    });
    setErro(null);
    setAberto(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await apiSend(
        editando ? `/api/salas/${editando.id}` : "/api/salas",
        editando ? "PATCH" : "POST",
        form,
      );
      setAberto(false);
      carregar();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(s: Sala) {
    const ok = await confirmar({
      titulo: `Remover a sala "${s.nome}"?`,
      descricao: "Sala com computadores ou pessoas não pode ser removida — nesse caso, desative-a.",
      confirmar: "Remover",
    });
    if (!ok) return;
    try {
      await apiSend(`/api/salas/${s.id}`, "DELETE");
      toast({ descricao: `Sala "${s.nome}" removida.`, variante: "sucesso" });
      carregar();
    } catch (e) {
      toastErro(mensagem(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">catálogo</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Salas
          </h1>
          <p className="text-sm text-muted-foreground">
            Divisão física do escritório. Abra uma sala para ver tudo que foi
            levado para ela e mover itens entre salas.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus /> Nova sala
        </Button>
      </div>

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
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhuma sala cadastrada. Crie a primeira em “Nova sala”.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((s) => (
            <Card key={s.id} className="relative overflow-hidden">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-1",
                  s.ativa ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <CardHeader className="pb-2 pl-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="eyebrow flex items-center gap-1">
                      <DoorOpen className="h-3 w-3" /> sala
                    </div>
                    <CardTitle className="truncate font-display text-base">
                      {s.nome}
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[s.predio && `Prédio ${s.predio}`, s.piso]
                        .filter(Boolean)
                        .join(" · ") || "sem prédio/piso"}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar sala ${s.nome}`}
                      title="Editar"
                      onClick={() => abrirEdicao(s)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover sala ${s.nome}`}
                      title="Remover"
                      onClick={() => remover(s)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pl-5">
                {!s.ativa && <Badge variant="outline">desativada</Badge>}
                {s.observacoes && (
                  <p className="text-xs text-muted-foreground">
                    {s.observacoes}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    <Monitor className="mr-1 h-3 w-3" />
                    {s._count.computadores} computador(es)
                  </Badge>
                  <Badge variant="secondary">
                    <Users className="mr-1 h-3 w-3" />
                    {s._count.funcionarios} funcionário(s)
                  </Badge>
                </div>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/salas/${s.id}`}>
                    Abrir sala <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar sala" : "Nova sala"}</DialogTitle>
            <DialogDescription>
              Prédio e piso são texto livre — use o que fizer sentido para o
              escritório.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome-sala">Nome</Label>
              <Input
                id="nome-sala"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Sala 93 — piso superior"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="predio-sala">Prédio</Label>
                <Input
                  id="predio-sala"
                  value={form.predio}
                  onChange={(e) => setForm({ ...form, predio: e.target.value })}
                  placeholder="93"
                  list="predios-sugeridos"
                />
                <datalist id="predios-sugeridos">
                  <option value="93" />
                  <option value="83" />
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="piso-sala">Piso</Label>
                <Input
                  id="piso-sala"
                  value={form.piso}
                  onChange={(e) => setForm({ ...form, piso: e.target.value })}
                  placeholder="superior"
                  list="pisos-sugeridos"
                />
                <datalist id="pisos-sugeridos">
                  <option value="superior" />
                  <option value="inferior" />
                  <option value="térreo" />
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ordem-sala">Ordem</Label>
                <Input
                  id="ordem-sala"
                  type="number"
                  min={0}
                  value={form.ordem}
                  onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obs-sala">Observações</Label>
              <Textarea
                id="obs-sala"
                value={form.observacoes}
                onChange={(e) =>
                  setForm({ ...form, observacoes: e.target.value })
                }
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={form.ativa ? "default" : "outline"}
                size="sm"
                aria-pressed={form.ativa}
                onClick={() => setForm({ ...form, ativa: !form.ativa })}
              >
                {form.ativa ? "Sala ativa" : "Sala desativada"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Desativada some dos seletores, mas mantém o histórico.
              </span>
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
