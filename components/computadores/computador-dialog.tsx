"use client";

import * as React from "react";
import { ArrowRightLeft, Headphones, Keyboard, Loader2, Mouse } from "lucide-react";
import { apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Computador, Funcionario } from "./types";

const SEM_FUNC = "__sem__";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  computador: Computador | null; // null = novo
  funcionarios: Funcionario[];
  onSaved: () => void;
};

export function ComputadorDialog({
  aberto,
  onOpenChange,
  computador,
  funcionarios,
  onSaved,
}: Props) {
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
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Inicializa os campos quando o diálogo abre (novo → defaults; edição → dados).
  React.useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setIdentificador(computador?.identificador ?? "");
    setApelido(computador?.apelido ?? "");
    setObservacoes(computador?.observacoes ?? "");
    setLoginPadrao(computador?.loginPadrao ?? "");
    setLicencaWindows(computador?.licencaWindows ?? "");
    setLicencaMicrosoft(computador?.licencaMicrosoft ?? "");
    setContaOutlook(computador?.contaOutlook ?? "");
    setTemMouse(computador?.temMouse ?? true);
    setTemTeclado(computador?.temTeclado ?? true);
    setTemHeadset(computador?.temHeadset ?? false);
    setPcFunc(computador?.funcionarioId ?? SEM_FUNC);
  }, [aberto, computador]);

  // Só funcionários ativos podem receber computador. Na edição, mantemos o dono
  // atual na lista mesmo se estiver inativo (para não perder o vínculo).
  const funcsAtribuiveis = React.useMemo(() => {
    const ativos = funcionarios.filter((f) => f.ativo);
    const donoAtual = funcionarios.find(
      (f) => f.id === computador?.funcionarioId,
    );
    if (donoAtual && !donoAtual.ativo) return [donoAtual, ...ativos];
    return ativos;
  }, [funcionarios, computador]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
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
      ...(computador ? { esperaAtualizadoEm: computador.atualizadoEm } : {}),
    };
    try {
      await apiSend(
        computador ? `/api/computadores/${computador.id}` : "/api/computadores",
        computador ? "PATCH" : "POST",
        body,
      );
      onSaved();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {computador ? "Editar computador" : "Novo computador"}
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
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
