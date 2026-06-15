"use client";

import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Cpu,
  ArrowRightLeft,
  PackageOpen,
  Search,
  Mouse,
  Keyboard,
  Headphones,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM_FUNC = "__sem__";

type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
};
type Tipo = { id: string; nome: string };
type Componente = {
  id: string;
  tipoId: string;
  descricao: string;
  especificacoes: Record<string, unknown> | null;
  tipo: { id: string; nome: string };
};
type Computador = {
  id: string;
  identificador: string;
  apelido: string | null;
  observacoes: string | null;
  loginPadrao: string | null;
  licencaWindows: string | null;
  licencaMicrosoft: string | null;
  contaOutlook: string | null;
  temMouse: boolean;
  temTeclado: boolean;
  temHeadset: boolean;
  funcionarioId: string | null;
  funcionario: Funcionario | null;
  componentes: Componente[];
  atualizadoEm: string; // usado para concorrência otimista na edição
};

type Spec = { chave: string; valor: string };

export default function ComputadoresPage() {
  const [computadores, setComputadores] = React.useState<Computador[]>([]);
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([]);
  const [tipos, setTipos] = React.useState<Tipo[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoPcId, setRemovendoPcId] = React.useState<string | null>(null);
  const [removendoCompId, setRemovendoCompId] = React.useState<string | null>(
    null,
  );

  // filtros
  const [busca, setBusca] = React.useState("");
  const [filtroFunc, setFiltroFunc] = React.useState<string>("todos");
  const [filtroCargo, setFiltroCargo] = React.useState<string>("todos");

  // dialog computador
  const [pcAberto, setPcAberto] = React.useState(false);
  const [pcEdit, setPcEdit] = React.useState<Computador | null>(null);
  const [identificador, setIdentificador] = React.useState("");
  const [apelido, setApelido] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [loginPadrao, setLoginPadrao] = React.useState("");
  const [licencaWindows, setLicencaWindows] = React.useState("");
  const [licencaMicrosoft, setLicencaMicrosoft] = React.useState("");
  const [contaOutlook, setContaOutlook] = React.useState("");
  const [temMouse, setTemMouse] = React.useState(true);
  const [temTeclado, setTemTeclado] = React.useState(true);
  const [temHeadset, setTemHeadset] = React.useState(false);
  const [pcFunc, setPcFunc] = React.useState<string>(SEM_FUNC);
  const [pcSalvando, setPcSalvando] = React.useState(false);
  const [pcErro, setPcErro] = React.useState<string | null>(null);

  // dialog componente
  const [compAberto, setCompAberto] = React.useState(false);
  const [compEdit, setCompEdit] = React.useState<Componente | null>(null);
  const [compPcId, setCompPcId] = React.useState<string>("");
  const [compTipo, setCompTipo] = React.useState<string>("");
  const [compDescricao, setCompDescricao] = React.useState("");
  const [specs, setSpecs] = React.useState<Spec[]>([]);
  const [compSalvando, setCompSalvando] = React.useState(false);
  const [compErro, setCompErro] = React.useState<string | null>(null);

  async function carregarTudo() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      const [c, f, t] = await Promise.all([
        apiGet<Computador[]>("/api/computadores"),
        apiGet<Funcionario[]>("/api/funcionarios"),
        apiGet<Tipo[]>("/api/tipos"),
      ]);
      setComputadores(c);
      setFuncionarios(f);
      setTipos(t);
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    carregarTudo();
  }, []);

  const cargos = React.useMemo(
    () => [...new Set(funcionarios.map((f) => f.cargo))].sort(),
    [funcionarios],
  );

  // Só funcionários ativos podem receber computador. Na edição, mantemos o
  // dono atual na lista mesmo se estiver inativo (para não perder o vínculo).
  const funcsAtribuiveis = React.useMemo(() => {
    const ativos = funcionarios.filter((f) => f.ativo);
    const donoAtual = funcionarios.find((f) => f.id === pcEdit?.funcionarioId);
    if (donoAtual && !donoAtual.ativo) return [donoAtual, ...ativos];
    return ativos;
  }, [funcionarios, pcEdit]);

  const termo = busca.trim().toLowerCase();
  const filtrados = computadores.filter((c) => {
    if (filtroFunc === "sem" && c.funcionarioId) return false;
    if (filtroFunc !== "todos" && filtroFunc !== "sem") {
      if (c.funcionarioId !== filtroFunc) return false;
    }
    if (filtroCargo !== "todos") {
      if (c.funcionario?.cargo !== filtroCargo) return false;
    }
    if (termo) {
      const alvo = [
        c.identificador,
        c.apelido,
        c.loginPadrao,
        c.contaOutlook,
        c.funcionario?.nome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  // ---------- Computador ----------
  function abrirNovoPc() {
    setPcEdit(null);
    setIdentificador("");
    setApelido("");
    setObservacoes("");
    setLoginPadrao("");
    setLicencaWindows("");
    setLicencaMicrosoft("");
    setContaOutlook("");
    setTemMouse(true);
    setTemTeclado(true);
    setTemHeadset(false);
    setPcFunc(SEM_FUNC);
    setPcErro(null);
    setPcAberto(true);
  }

  function abrirEdicaoPc(c: Computador) {
    setPcEdit(c);
    setIdentificador(c.identificador);
    setApelido(c.apelido ?? "");
    setObservacoes(c.observacoes ?? "");
    setLoginPadrao(c.loginPadrao ?? "");
    setLicencaWindows(c.licencaWindows ?? "");
    setLicencaMicrosoft(c.licencaMicrosoft ?? "");
    setContaOutlook(c.contaOutlook ?? "");
    setTemMouse(c.temMouse);
    setTemTeclado(c.temTeclado);
    setTemHeadset(c.temHeadset);
    setPcFunc(c.funcionarioId ?? SEM_FUNC);
    setPcErro(null);
    setPcAberto(true);
  }

  async function salvarPc() {
    setPcSalvando(true);
    setPcErro(null);
    const body = {
      identificador,
      apelido,
      observacoes,
      loginPadrao,
      licencaWindows,
      licencaMicrosoft,
      contaOutlook,
      temMouse,
      temTeclado,
      temHeadset,
      funcionarioId: pcFunc === SEM_FUNC ? null : pcFunc,
      // Concorrência otimista: na edição, informamos a versão que carregamos.
      ...(pcEdit ? { esperaAtualizadoEm: pcEdit.atualizadoEm } : {}),
    };
    try {
      await apiSend(
        pcEdit ? `/api/computadores/${pcEdit.id}` : "/api/computadores",
        pcEdit ? "PATCH" : "POST",
        body,
      );
      setPcAberto(false);
      carregarTudo();
    } catch (e) {
      setPcErro(mensagem(e));
    } finally {
      setPcSalvando(false);
    }
  }

  async function removerPc(c: Computador) {
    if (
      !confirm(
        `Remover o computador "${c.identificador}"? Os ${c.componentes.length} componente(s) serão removidos junto.`,
      )
    )
      return;
    setRemovendoPcId(c.id);
    try {
      await apiSend(`/api/computadores/${c.id}`, "DELETE");
      carregarTudo();
    } catch (e) {
      alert(mensagem(e));
    } finally {
      setRemovendoPcId(null);
    }
  }

  // ---------- Componente ----------
  function specsParaArray(esp: Record<string, unknown> | null): Spec[] {
    if (!esp) return [];
    return Object.entries(esp).map(([chave, valor]) => ({
      chave,
      valor: String(valor),
    }));
  }

  function abrirNovoComp(pcId: string) {
    setCompEdit(null);
    setCompPcId(pcId);
    setCompTipo(tipos[0]?.id ?? "");
    setCompDescricao("");
    setSpecs([]);
    setCompErro(null);
    setCompAberto(true);
  }

  function abrirEdicaoComp(pcId: string, comp: Componente) {
    setCompEdit(comp);
    setCompPcId(pcId);
    setCompTipo(comp.tipoId);
    setCompDescricao(comp.descricao);
    setSpecs(specsParaArray(comp.especificacoes));
    setCompErro(null);
    setCompAberto(true);
  }

  function montarEspecificacoes(): Record<string, string> | null {
    const validos = specs.filter((s) => s.chave.trim() !== "");
    if (validos.length === 0) return null;
    const obj: Record<string, string> = {};
    for (const s of validos) obj[s.chave.trim()] = s.valor;
    return obj;
  }

  async function salvarComp() {
    setCompSalvando(true);
    setCompErro(null);
    const especificacoes = montarEspecificacoes();
    const body = compEdit
      ? { tipoId: compTipo, descricao: compDescricao, especificacoes }
      : {
          computadorId: compPcId,
          tipoId: compTipo,
          descricao: compDescricao,
          especificacoes,
        };
    try {
      await apiSend(
        compEdit ? `/api/componentes/${compEdit.id}` : "/api/componentes",
        compEdit ? "PATCH" : "POST",
        body,
      );
      setCompAberto(false);
      carregarTudo();
    } catch (e) {
      setCompErro(mensagem(e));
    } finally {
      setCompSalvando(false);
    }
  }

  async function removerComp(comp: Componente) {
    if (!confirm(`Remover o componente "${comp.descricao}"?`)) return;
    setRemovendoCompId(comp.id);
    try {
      await apiSend(`/api/componentes/${comp.id}`, "DELETE");
      carregarTudo();
    } catch (e) {
      alert(mensagem(e));
    } finally {
      setRemovendoCompId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Computadores
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie máquinas, hardware e a quem cada uma pertence.
          </p>
        </div>
        <Button onClick={abrirNovoPc}>
          <Plus /> Novo computador
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="busca">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Identificador, apelido, login, conta..."
                className="w-64 pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Funcionário</Label>
            <Select value={filtroFunc} onValueChange={setFiltroFunc}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem">— Sem funcionário —</SelectItem>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Select value={filtroCargo} onValueChange={setFiltroCargo}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {cargos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(busca !== "" ||
            filtroFunc !== "todos" ||
            filtroCargo !== "todos") && (
            <Button
              variant="ghost"
              onClick={() => {
                setBusca("");
                setFiltroFunc("todos");
                setFiltroCargo("todos");
              }}
            >
              Limpar filtros
            </Button>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {filtrados.length} computador(es)
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
          <Button variant="outline" size="sm" onClick={carregarTudo}>
            Tentar novamente
          </Button>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum computador encontrado.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtrados.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      {c.identificador}
                    </CardTitle>
                    {c.apelido && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {c.apelido}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Editar / mover"
                      aria-label={`Editar ${c.identificador}`}
                      onClick={() => abrirEdicaoPc(c)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Remover"
                      aria-label={`Remover ${c.identificador}`}
                      disabled={removendoPcId === c.id}
                      onClick={() => removerPc(c)}
                    >
                      {removendoPcId === c.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 className="text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="mt-1">
                  {c.funcionario ? (
                    <Badge variant="secondary">
                      {c.funcionario.nome} · {c.funcionario.cargo}
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <PackageOpen className="mr-1 h-3 w-3" /> Sem funcionário
                      (estoque)
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(c.loginPadrao ||
                  c.contaOutlook ||
                  c.licencaWindows ||
                  c.licencaMicrosoft) && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                    {c.loginPadrao && (
                      <>
                        <dt className="text-muted-foreground">Login</dt>
                        <dd className="font-medium">{c.loginPadrao}</dd>
                      </>
                    )}
                    {c.contaOutlook && (
                      <>
                        <dt className="text-muted-foreground">Outlook</dt>
                        <dd className="break-all font-medium">
                          {c.contaOutlook}
                        </dd>
                      </>
                    )}
                    {c.licencaWindows && (
                      <>
                        <dt className="text-muted-foreground">Windows</dt>
                        <dd className="break-all font-medium">
                          {c.licencaWindows}
                        </dd>
                      </>
                    )}
                    {c.licencaMicrosoft && (
                      <>
                        <dt className="text-muted-foreground">Microsoft</dt>
                        <dd className="break-all font-medium">
                          {c.licencaMicrosoft}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                <div className="flex flex-wrap gap-1">
                  <Badge variant={c.temMouse ? "secondary" : "outline"}>
                    <Mouse className="mr-1 h-3 w-3" /> Mouse
                    {c.temMouse ? "" : " ✕"}
                  </Badge>
                  <Badge variant={c.temTeclado ? "secondary" : "outline"}>
                    <Keyboard className="mr-1 h-3 w-3" /> Teclado
                    {c.temTeclado ? "" : " ✕"}
                  </Badge>
                  <Badge variant={c.temHeadset ? "secondary" : "outline"}>
                    <Headphones className="mr-1 h-3 w-3" /> Headset
                    {c.temHeadset ? "" : " ✕"}
                  </Badge>
                </div>
                {c.observacoes && (
                  <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                    {c.observacoes}
                  </p>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Hardware ({c.componentes.length})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => abrirNovoComp(c.id)}
                    >
                      <Plus /> Componente
                    </Button>
                  </div>
                  {c.componentes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum componente registrado.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {c.componentes.map((comp) => (
                        <li
                          key={comp.id}
                          className="flex items-start justify-between gap-2 p-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm">
                              <span className="font-medium">
                                {comp.tipo.nome}:
                              </span>{" "}
                              {comp.descricao}
                            </div>
                            {comp.especificacoes &&
                              Object.keys(comp.especificacoes).length > 0 && (
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {Object.entries(comp.especificacoes).map(
                                    ([k, v]) => (
                                      <Badge
                                        key={k}
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {k}: {String(v)}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Editar componente ${comp.tipo.nome}`}
                              title="Editar componente"
                              onClick={() => abrirEdicaoComp(c.id, comp)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Remover componente ${comp.tipo.nome}`}
                              title="Remover componente"
                              disabled={removendoCompId === comp.id}
                              onClick={() => removerComp(comp)}
                            >
                              {removendoCompId === comp.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Computador */}
      <Dialog open={pcAberto} onOpenChange={setPcAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pcEdit ? "Editar computador" : "Novo computador"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" /> Trocar o funcionário aqui
              também move o computador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ident">Identificador (patrimônio/hostname)</Label>
              <Input
                id="ident"
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Ex: PAT-1001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apelido">Apelido (opcional)</Label>
              <Input
                id="apelido"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="Ex: PC Atendimento 01"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Funcionário</Label>
              <Select value={pcFunc} onValueChange={setPcFunc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_FUNC}>
                    — Sem funcionário (estoque) —
                  </SelectItem>
                  {funcsAtribuiveis.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome} · {f.cargo}
                      {!f.ativo && " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Login, licenças e conta (opcionais)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="login">Login padrão</Label>
                  <Input
                    id="login"
                    value={loginPadrao}
                    onChange={(e) => setLoginPadrao(e.target.value)}
                    placeholder="Ex: COB-1024"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="outlook">Conta Outlook corporativo</Label>
                  <Input
                    id="outlook"
                    type="email"
                    value={contaOutlook}
                    onChange={(e) => setContaOutlook(e.target.value)}
                    placeholder="Ex: ana@cobratec.com.br"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="winlic">Licença Windows</Label>
                  <Input
                    id="winlic"
                    value={licencaWindows}
                    onChange={(e) => setLicencaWindows(e.target.value)}
                    placeholder="Chave / observação"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mslic">Licença Microsoft / Office</Label>
                  <Input
                    id="mslic"
                    value={licencaMicrosoft}
                    onChange={(e) => setLicencaMicrosoft(e.target.value)}
                    placeholder="Microsoft 365 / Office"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Periféricos</Label>
              <p className="text-xs text-muted-foreground">
                Marque os periféricos que acompanham a máquina.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={temMouse ? "default" : "outline"}
                  size="sm"
                  aria-pressed={temMouse}
                  onClick={() => setTemMouse((v) => !v)}
                >
                  <Mouse /> Mouse
                </Button>
                <Button
                  type="button"
                  variant={temTeclado ? "default" : "outline"}
                  size="sm"
                  aria-pressed={temTeclado}
                  onClick={() => setTemTeclado((v) => !v)}
                >
                  <Keyboard /> Teclado
                </Button>
                <Button
                  type="button"
                  variant={temHeadset ? "default" : "outline"}
                  size="sm"
                  aria-pressed={temHeadset}
                  onClick={() => setTemHeadset((v) => !v)}
                >
                  <Headphones /> Headset
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obs">Observações (opcional)</Label>
              <Textarea
                id="obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
            {pcErro && <p className="text-sm text-destructive">{pcErro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPcAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarPc} disabled={pcSalvando}>
              {pcSalvando && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Componente */}
      <Dialog open={compAberto} onOpenChange={setCompAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {compEdit ? "Editar componente" : "Adicionar componente"}
            </DialogTitle>
            <DialogDescription>
              Escolha o tipo do catálogo. Especificações são campos livres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              {tipos.length === 0 ? (
                <p className="text-sm text-destructive">
                  Cadastre um tipo de componente primeiro (aba Tipos).
                </p>
              ) : (
                <Select value={compTipo} onValueChange={setCompTipo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição</Label>
              <Input
                id="desc"
                value={compDescricao}
                onChange={(e) => setCompDescricao(e.target.value)}
                placeholder="Ex: Kingston 8GB DDR4 2666MHz"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Especificações (opcional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSpecs((s) => [...s, { chave: "", valor: "" }])
                  }
                >
                  <Plus /> Campo
                </Button>
              </div>
              {specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="campo (ex: capacidadeGB)"
                    value={s.chave}
                    onChange={(e) =>
                      setSpecs((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, chave: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="valor (ex: 8)"
                    value={s.valor}
                    onChange={(e) =>
                      setSpecs((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, valor: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setSpecs((arr) => arr.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            {compErro && <p className="text-sm text-destructive">{compErro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarComp}
              disabled={compSalvando || tipos.length === 0}
            >
              {compSalvando && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
