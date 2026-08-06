"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    if (!confirm(`Remover a sala "${s.nome}"?`)) return;
    try {
      await apiSend(`/api/salas/${s.id}`, "DELETE");
      carregar();
    } catch (e) {
      alert(mensagem(e));
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
            Divisão física do escritório. Cadastre quantas salas precisar — elas
            aparecem nos formulários de computador e de funcionário.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus /> Nova sala
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Salas do escritório</CardTitle>
        </CardHeader>
        <CardContent>
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
            <p className="text-sm text-muted-foreground">
              Nenhuma sala cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sala</TableHead>
                  <TableHead>Prédio / piso</TableHead>
                  <TableHead>Computadores</TableHead>
                  <TableHead>Funcionários</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {s.nome}
                        {!s.ativa && (
                          <Badge variant="outline">desativada</Badge>
                        )}
                      </div>
                      {s.observacoes && (
                        <div className="text-xs text-muted-foreground">
                          {s.observacoes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[s.predio && `Prédio ${s.predio}`, s.piso]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {s._count.computadores}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {s._count.funcionarios}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar sala ${s.nome}`}
                        onClick={() => abrirEdicao(s)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover sala ${s.nome}`}
                        onClick={() => remover(s)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
