"use client";

import * as React from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
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
import type { Celular, Funcionario } from "./types";

const SEM_FUNC = "__sem__";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  celular: Celular | null; // null = novo
  funcionarios: Funcionario[];
  onSaved: () => void;
};

export function CelularDialog({
  aberto,
  onOpenChange,
  celular,
  funcionarios,
  onSaved,
}: Props) {
  const [identificador, setIdentificador] = React.useState("");
  const [apelido, setApelido] = React.useState("");
  const [numero, setNumero] = React.useState("");
  const [operadora, setOperadora] = React.useState("");
  const [imei, setImei] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [celFunc, setCelFunc] = React.useState<string>(SEM_FUNC);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Inicializa os campos quando o diálogo abre (novo → defaults; edição → dados).
  React.useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setIdentificador(celular?.identificador ?? "");
    setApelido(celular?.apelido ?? "");
    setNumero(celular?.numero ?? "");
    setOperadora(celular?.operadora ?? "");
    setImei(celular?.imei ?? "");
    setObservacoes(celular?.observacoes ?? "");
    setCelFunc(celular?.funcionarioId ?? SEM_FUNC);
  }, [aberto, celular]);

  // Só funcionários ativos podem receber celular. Na edição, mantemos o dono
  // atual na lista mesmo se estiver inativo (para não perder o vínculo).
  const funcsAtribuiveis = React.useMemo(() => {
    const ativos = funcionarios.filter((f) => f.ativo);
    const donoAtual = funcionarios.find((f) => f.id === celular?.funcionarioId);
    if (donoAtual && !donoAtual.ativo) return [donoAtual, ...ativos];
    return ativos;
  }, [funcionarios, celular]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const body = {
      identificador,
      apelido,
      numero,
      operadora,
      imei,
      observacoes,
      funcionarioId: celFunc === SEM_FUNC ? null : celFunc,
      // Concorrência otimista: na edição, informamos a versão que carregamos.
      ...(celular ? { esperaAtualizadoEm: celular.atualizadoEm } : {}),
    };
    try {
      await apiSend(
        celular ? `/api/celulares/${celular.id}` : "/api/celulares",
        celular ? "PATCH" : "POST",
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
          <DialogTitle>{celular ? "Editar celular" : "Novo celular"}</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <ArrowRightLeft className="h-3 w-3" /> Trocar o funcionário aqui
            também move o celular.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ident">Identificador (patrimônio/etiqueta)</Label>
            <Input
              id="ident"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="Ex: CEL-1001"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apelido">Modelo / apelido (opcional)</Label>
            <Input
              id="apelido"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Ex: Samsung Galaxy A14"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Funcionário</Label>
            <Select value={celFunc} onValueChange={setCelFunc}>
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
              Linha e aparelho (opcionais)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="numero">Número da linha</Label>
                <Input
                  id="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ex: (11) 99999-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="operadora">Operadora</Label>
                <Input
                  id="operadora"
                  value={operadora}
                  onChange={(e) => setOperadora(e.target.value)}
                  placeholder="Ex: Vivo, Claro, Tim"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="imei">IMEI</Label>
                <Input
                  id="imei"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="IMEI do aparelho"
                />
              </div>
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
