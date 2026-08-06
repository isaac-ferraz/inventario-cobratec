"use client";

import * as React from "react";
import Link from "next/link";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Sala = { id: string; nome: string; ativa: boolean };

type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  loginSiscobra: string | null;
  senhaSiscobra: string | null;
  loginVonix: string | null;
  senhaVonix: string | null;
  ativo: boolean;
  salaId: string | null;
  sala: Sala | null;
  _count: { computadores: number; celulares: number };
};

// Valor sentinela do seletor: o Radix Select não aceita item com value "".
const SEM_SALA = "__sem_sala__";

export default function FuncionariosPage() {
  const [lista, setLista] = React.useState<Funcionario[]>([]);
  const [salas, setSalas] = React.useState<Sala[]>([]);
  const [filtroSala, setFiltroSala] = React.useState<string>("todos");
  const [carregando, setCarregando] = React.useState(true);
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Funcionario | null>(null);

  const [nome, setNome] = React.useState("");
  const [cargo, setCargo] = React.useState("");
  const [loginSiscobra, setLoginSiscobra] = React.useState("");
  const [senhaSiscobra, setSenhaSiscobra] = React.useState("");
  const [loginVonix, setLoginVonix] = React.useState("");
  const [senhaVonix, setSenhaVonix] = React.useState("");
  const [salaId, setSalaId] = React.useState<string>(SEM_SALA);
  const [ativo, setAtivo] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      const [f, s] = await Promise.all([
        apiGet<Funcionario[]>("/api/funcionarios"),
        apiGet<Sala[]>("/api/salas"),
      ]);
      setLista(f);
      setSalas(s);
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    carregar();
  }, []);

  const filtrados = React.useMemo(() => {
    if (filtroSala === "todos") return lista;
    if (filtroSala === "sem") return lista.filter((f) => !f.salaId);
    return lista.filter((f) => f.salaId === filtroSala);
  }, [lista, filtroSala]);

  function abrirNovo() {
    setEditando(null);
    setNome("");
    setCargo("");
    setLoginSiscobra("");
    setSenhaSiscobra("");
    setLoginVonix("");
    setSenhaVonix("");
    setSalaId(SEM_SALA);
    setAtivo(true);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(f: Funcionario) {
    setEditando(f);
    setNome(f.nome);
    setCargo(f.cargo);
    setLoginSiscobra(f.loginSiscobra ?? "");
    setSenhaSiscobra(f.senhaSiscobra ?? "");
    setLoginVonix(f.loginVonix ?? "");
    setSenhaVonix(f.senhaVonix ?? "");
    setSalaId(f.salaId ?? SEM_SALA);
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
        {
          nome,
          cargo,
          loginSiscobra,
          senhaSiscobra,
          loginVonix,
          senhaVonix,
          salaId: salaId === SEM_SALA ? null : salaId,
          ativo,
        },
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
    const pcs = f._count.computadores;
    const cels = f._count.celulares;
    const temVinculo = pcs + cels > 0;
    const msg = temVinculo
      ? `${f.nome} possui ${pcs} computador(es) e ${cels} celular(es). Eles ficarão SEM funcionário (estoque). Remover assim mesmo?`
      : `Remover ${f.nome}?`;
    if (!confirm(msg)) return;
    setRemovendoId(f.id);
    try {
      await apiSend(
        `/api/funcionarios/${f.id}${temVinculo ? "?liberar=1" : ""}`,
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
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="font-display text-base">Lista</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="filtro-sala" className="text-xs text-muted-foreground">
              Sala
            </Label>
            <Select value={filtroSala} onValueChange={setFiltroSala}>
              <SelectTrigger id="filtro-sala" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="sem">— Sem sala definida —</SelectItem>
                {salas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lista.length === 0
                ? "Nenhum funcionário cadastrado."
                : "Nenhum funcionário nesta sala."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Siscobra</TableHead>
                  <TableHead>Vonix</TableHead>
                  <TableHead>Computadores</TableHead>
                  <TableHead>Celulares</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell>{f.cargo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.sala ? (
                        <Link
                          href={`/salas/${f.sala.id}`}
                          className="underline-offset-2 hover:text-foreground hover:underline"
                          title={`Abrir a sala ${f.sala.nome}`}
                        >
                          {f.sala.nome}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {f.loginSiscobra ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {f.loginVonix ?? "—"}
                    </TableCell>
                    <TableCell>{f._count.computadores}</TableCell>
                    <TableCell>{f._count.celulares}</TableCell>
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
              <Label>Sala</Label>
              <Select value={salaId} onValueChange={setSalaId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_SALA}>— Sem sala definida —</SelectItem>
                  {salas
                    .filter((s) => s.ativa || s.id === salaId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                        {!s.ativa && " (desativada)"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Onde a pessoa senta. Sugerida ao vincular um computador a ela.
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Credenciais dos sistemas (opcionais)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="loginSiscobra">Login Siscobra</Label>
                  <Input
                    id="loginSiscobra"
                    value={loginSiscobra}
                    onChange={(e) => setLoginSiscobra(e.target.value)}
                    placeholder="Login do Siscobra"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senhaSiscobra">Senha Siscobra</Label>
                  <Input
                    id="senhaSiscobra"
                    value={senhaSiscobra}
                    onChange={(e) => setSenhaSiscobra(e.target.value)}
                    placeholder="Senha do Siscobra"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loginVonix">Login Vonix</Label>
                  <Input
                    id="loginVonix"
                    value={loginVonix}
                    onChange={(e) => setLoginVonix(e.target.value)}
                    placeholder="Login do Vonix"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senhaVonix">Senha Vonix</Label>
                  <Input
                    id="senhaVonix"
                    value={senhaVonix}
                    onChange={(e) => setSenhaVonix(e.target.value)}
                    placeholder="Senha do Vonix"
                  />
                </div>
              </div>
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
