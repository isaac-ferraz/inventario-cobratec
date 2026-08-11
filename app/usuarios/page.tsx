"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { ImportarCsv } from "@/components/importar-csv";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { cn } from "@/lib/utils";
import type { Papel } from "@/lib/supervisao";

type Usuario = {
  id: string;
  login: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  senhaProvisoria: boolean;
  funcionarioId: string | null;
  siscobraUsucod: number | null;
  funcionario: { id: string; nome: string; cargo: string } | null;
  ultimoAcessoEm: string | null;
  supervisoes: { sala: { id: string; nome: string } }[];
};

type Funcionario = { id: string; nome: string; cargo: string; ativo: boolean };
type Sala = { id: string; nome: string; ativa: boolean };

const SEM_FUNC = "__sem__";

const VAZIO = {
  login: "",
  nome: "",
  senha: "",
  papel: "OPERADOR" as Papel,
  ativo: true,
  funcionarioId: SEM_FUNC,
  // Texto no formulário e número na API: campo numérico vazio é "" no DOM, e
  // guardar 0 para "em branco" confundiria "sem código" com o código 0.
  siscobraUsucod: "",
  salaIds: [] as string[],
};

function quando(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function UsuariosPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [lista, setLista] = React.useState<Usuario[]>([]);
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [editando, setEditando] = React.useState<Usuario | null>(null);
  const [form, setForm] = React.useState(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);
  const [salas, setSalas] = React.useState<Sala[]>([]);

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      const [u, f, s] = await Promise.all([
        apiGet<Usuario[]>("/api/usuarios"),
        apiGet<Funcionario[]>("/api/funcionarios"),
        apiGet<Sala[]>("/api/salas"),
      ]);
      setLista(u);
      setFuncionarios(f);
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

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(u: Usuario) {
    setEditando(u);
    setForm({
      login: u.login,
      nome: u.nome,
      senha: "", // vazio = mantém a senha atual
      papel: u.papel,
      ativo: u.ativo,
      funcionarioId: u.funcionarioId ?? SEM_FUNC,
      siscobraUsucod: u.siscobraUsucod === null ? "" : String(u.siscobraUsucod),
      salaIds: u.supervisoes.map((s) => s.sala.id),
    });
    setErro(null);
    setAberto(true);
  }

  function alternarSala(id: string) {
    setForm((f) => ({
      ...f,
      salaIds: f.salaIds.includes(id)
        ? f.salaIds.filter((x) => x !== id)
        : [...f.salaIds, id],
    }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const corpo: Record<string, unknown> = {
      login: form.login,
      nome: form.nome,
      papel: form.papel,
      // Só vai quando é supervisor; a API zera o vínculo nos outros papéis.
      salaIds: form.papel === "SUPERVISOR" ? form.salaIds : [],
      ativo: form.ativo,
      funcionarioId: form.funcionarioId === SEM_FUNC ? null : form.funcionarioId,
      // Como as salas: só vai quando é cobrança, e a API zera nos demais.
      // Em branco vira null — "não tem código", que é diferente de zero.
      siscobraUsucod:
        form.papel === "COBRANCA" && form.siscobraUsucod.trim() !== ""
          ? Number(form.siscobraUsucod)
          : null,
    };
    // Na edição, senha em branco significa "não mexer".
    if (form.senha) corpo.senha = form.senha;

    try {
      await apiSend(
        editando ? `/api/usuarios/${editando.id}` : "/api/usuarios",
        editando ? "PATCH" : "POST",
        corpo,
      );
      setAberto(false);
      carregar();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(u: Usuario) {
    const ok = await confirmar({
      titulo: `Remover o usuário "${u.login}"?`,
      descricao:
        "Ele perde o acesso imediatamente. O histórico de auditoria é preservado.",
      confirmar: "Remover",
    });
    if (!ok) return;
    setRemovendoId(u.id);
    try {
      await apiSend(`/api/usuarios/${u.id}`, "DELETE");
      toast({ descricao: `Usuário "${u.login}" removido.`, variante: "sucesso" });
      carregar();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">acesso</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Quem entra no sistema. <strong>Administrador</strong> faz tudo;{" "}
            <strong>supervisor</strong> vê e edita o que está nas salas dele;{" "}
            <strong>operador</strong> só abre e acompanha chamados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportarCsv entidade="usuarios" onPronto={carregar} />
          <Button onClick={abrirNovo}>
            <Plus /> Novo usuário
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Contas</CardTitle>
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
              Nenhum usuário cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Login</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {u.login}
                    </TableCell>
                    <TableCell>{u.nome}</TableCell>
                    <TableCell>
                      {u.papel === "ADMIN" ? (
                        <Badge>Administrador</Badge>
                      ) : u.papel === "SUPERVISOR" ? (
                        <Badge variant="warning">Supervisor</Badge>
                      ) : u.papel === "COBRANCA" ? (
                        <Badge variant="success">Cobrança</Badge>
                      ) : (
                        <Badge variant="secondary">Operador</Badge>
                      )}
                      {/* As salas ficam junto do papel: um supervisor sem sala
                          não enxerga nada, e isso precisa saltar aos olhos. */}
                      {u.papel === "SUPERVISOR" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {u.supervisoes.length === 0 ? (
                            <span className="num-alerta">nenhuma sala</span>
                          ) : (
                            u.supervisoes.map((s) => s.sala.nome).join(", ")
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.funcionario ? (
                        <Link
                          href={`/funcionarios/${u.funcionario.id}`}
                          className="hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {u.funcionario.nome} · {u.funcionario.cargo}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {quando(u.ultimoAcessoEm)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.ativo ? (
                          <Badge variant="success">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                        {u.senhaProvisoria && (
                          <Badge variant="warning">
                            <KeyRound className="mr-1 h-3 w-3" /> senha
                            provisória
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${u.login}`}
                        title="Editar / redefinir senha"
                        onClick={() => abrirEdicao(u)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${u.login}`}
                        title="Remover"
                        disabled={removendoId === u.id}
                        onClick={() => remover(u)}
                      >
                        {removendoId === u.id ? (
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando ? `Editar ${editando.login}` : "Novo usuário"}
            </DialogTitle>
            <DialogDescription>
              {editando
                ? "Deixe a senha em branco para mantê-la. Preencher define uma nova senha provisória."
                : "A senha inicial é provisória: o usuário terá de trocá-la no primeiro acesso."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-login">Login</Label>
                <Input
                  id="u-login"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="ex: ana.souza"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-nome">Nome</Label>
                <Input
                  id="u-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Nome de exibição"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="u-senha">
                {editando ? "Nova senha (opcional)" : "Senha inicial"}
              </Label>
              <Input
                id="u-senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                autoComplete="new-password"
                placeholder={editando ? "deixe em branco para manter" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 8 caracteres.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select
                  value={form.papel}
                  onValueChange={(v) => setForm({ ...form, papel: v as Papel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPERVISOR">
                      Supervisor — as salas dele
                    </SelectItem>
                    <SelectItem value="COBRANCA">
                      Cobrança — conversas e chamados
                    </SelectItem>
                    <SelectItem value="OPERADOR">
                      Operador — só chamados
                    </SelectItem>
                    <SelectItem value="ADMIN">
                      Administrador — acesso total
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Mesma ideia das salas: o código do Siscobra só significa
                  alguma coisa para quem atende devedor. */}
              {form.papel === "COBRANCA" && (
                <div className="space-y-1.5">
                  <Label htmlFor="siscobraUsucod">Código no Siscobra</Label>
                  <Input
                    id="siscobraUsucod"
                    inputMode="numeric"
                    value={form.siscobraUsucod}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        // Só dígitos: o campo é o `usucod` do Siscobra, e
                        // deixar texto passar só adiaria o erro para a API.
                        siscobraUsucod: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="ex.: 1042"
                  />
                  <p
                    className={cn(
                      "text-xs",
                      form.siscobraUsucod.trim() === ""
                        ? "num-alerta"
                        : "text-muted-foreground",
                    )}
                  >
                    {form.siscobraUsucod.trim() === ""
                      ? "Sem código, as conversas dela não têm como ser atribuídas."
                      : "É o usucod da operadora no CRM — liga as conversas ao trabalho dela."}
                  </p>
                </div>
              )}
              {/* Salas só aparecem para supervisor: para os outros papéis o
                  campo não significaria nada. */}
              {form.papel === "SUPERVISOR" && (
                <div className="space-y-1.5">
                  <Label>Salas pelas quais responde</Label>
                  {salas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma sala cadastrada ainda.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                      {salas.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={form.salaIds.includes(s.id)}
                            onChange={() => alternarSala(s.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {s.nome}
                            {!s.ativa && (
                              <span className="text-muted-foreground">
                                {" "}
                                · desativada
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p
                    className={cn(
                      "text-xs",
                      form.salaIds.length === 0
                        ? "num-alerta"
                        : "text-muted-foreground",
                    )}
                  >
                    {form.salaIds.length === 0
                      ? "Sem sala, o supervisor não enxerga nada além dos próprios chamados."
                      : `${form.salaIds.length} sala(s) — sem limite de supervisores por sala.`}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Funcionário vinculado</Label>
                <Select
                  value={form.funcionarioId}
                  onValueChange={(v) => setForm({ ...form, funcionarioId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_FUNC}>— Nenhum —</SelectItem>
                    {funcionarios
                      .filter((f) => f.ativo || f.id === form.funcionarioId)
                      .map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome} · {f.cargo}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opcional — liga a conta ao posto de trabalho.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={form.ativo ? "default" : "outline"}
                size="sm"
                aria-pressed={form.ativo}
                onClick={() => setForm({ ...form, ativo: !form.ativo })}
              >
                {form.ativo ? "Conta ativa" : "Conta inativa"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Inativa impede o login sem apagar o histórico.
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
