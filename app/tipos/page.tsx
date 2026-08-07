"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
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

type Tipo = {
  id: string;
  nome: string;
  _count: { componentes: number };
};

export default function TiposPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [lista, setLista] = React.useState<Tipo[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Tipo | null>(null);
  const [nome, setNome] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      setLista(await apiGet<Tipo[]>("/api/tipos"));
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
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(t: Tipo) {
    setEditando(t);
    setNome(t.nome);
    setErro(null);
    setAberto(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await apiSend(
        editando ? `/api/tipos/${editando.id}` : "/api/tipos",
        editando ? "PATCH" : "POST",
        { nome },
      );
      setAberto(false);
      carregar();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(t: Tipo) {
    const ok = await confirmar({
      titulo: `Remover o tipo "${t.nome}"?`,
      descricao: "Tipo em uso por algum componente não pode ser removido.",
      confirmar: "Remover",
    });
    if (!ok) return;
    try {
      await apiSend(`/api/tipos/${t.id}`, "DELETE");
      toast({ descricao: `Tipo "${t.nome}" removido.`, variante: "sucesso" });
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
            Tipos de componente
          </h1>
          <p className="text-sm text-muted-foreground">
            Catálogo editável (CPU, RAM, SSD, Monitor...). Adicione tipos novos
            sem mexer no código.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus /> Novo tipo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Catálogo</CardTitle>
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
              Nenhum tipo cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Em uso por</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t._count.componentes} componente(s)
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => abrirEdicao(t)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remover(t)}
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
            <DialogTitle>{editando ? "Editar tipo" : "Novo tipo"}</DialogTitle>
            <DialogDescription>
              Nome do tipo de componente de hardware.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome-tipo">Nome</Label>
              <Input
                id="nome-tipo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Memória RAM"
              />
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
