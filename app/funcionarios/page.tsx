"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  matricula: string | null;
  ativo: boolean;
  _count: { computadores: number };
};

export default function FuncionariosPage() {
  const [lista, setLista] = React.useState<Funcionario[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Funcionario | null>(null);

  const [nome, setNome] = React.useState("");
  const [cargo, setCargo] = React.useState("");
  const [matricula, setMatricula] = React.useState("");
  const [ativo, setAtivo] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      setLista(await apiGet<Funcionario[]>("/api/funcionarios"));
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
    setNome("");
    setCargo("");
    setMatricula("");
    setAtivo(true);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(f: Funcionario) {
    setEditando(f);
    setNome(f.nome);
    setCargo(f.cargo);
    setMatricula(f.matricula ?? "");
    setAtivo(f.ativo);
    setErro(null);
    setAberto(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await apiSend(
        editando ? `/api/funcionarios/${editando.id}` : "/api/funcionarios",
        editando ? "PATCH" : "POST",
        { nome, cargo, matricula, ativo },
      );
      setAberto(false);
      carregar();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(f: Funcionario) {
    const temPc = f._count.computadores > 0;
    const msg = temPc
      ? `${f.nome} possui ${f._count.computadores} computador(es). Eles ficarão SEM funcionário (estoque). Remover assim mesmo?`
      : `Remover ${f.nome}?`;
    if (!confirm(msg)) return;
    setRemovendoId(f.id);
    try {
      await apiSend(
        `/api/funcionarios/${f.id}${temPc ? "?liberar=1" : ""}`,
        "DELETE",
      );
      carregar();
    } catch (e) {
      alert(mensagem(e));
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">cadastro</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Funcionários
          </h1>
          <p className="text-sm text-muted-foreground">
            Donos dos computadores. Cargo é texto livre.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus /> Novo funcionário
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Lista</CardTitle>
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
              Nenhum funcionário cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Computadores</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell>{f.cargo}</TableCell>
                    <TableCell>{f.matricula ?? "—"}</TableCell>
                    <TableCell>{f._count.computadores}</TableCell>
                    <TableCell>
                      {f.ativo ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${f.nome}`}
                        title="Editar"
                        onClick={() => abrirEdicao(f)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${f.nome}`}
                        title="Remover"
                        disabled={removendoId === f.id}
                        onClick={() => remover(f)}
                      >
                        {removendoId === f.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 className="text-destructive" />
                        )}
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
            <DialogTitle>
              {editando ? "Editar funcionário" : "Novo funcionário"}
            </DialogTitle>
            <DialogDescription>
              Marcar como inativo preserva o histórico (ex: desligamento).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ana Souza"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex: Operadora, Gestor, Supervisor..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="matricula">Matrícula (opcional)</Label>
              <Input
                id="matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Ex: OP-001"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4"
              />
              Funcionário ativo
            </label>
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
