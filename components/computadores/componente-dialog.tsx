"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Componente, Spec, Tipo } from "./types";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  computadorId: string;
  componente: Componente | null; // null = novo
  tipos: Tipo[];
  onSaved: () => void;
};

function specsParaArray(esp: Record<string, unknown> | null): Spec[] {
  if (!esp) return [];
  return Object.entries(esp).map(([chave, valor]) => ({
    chave,
    valor: String(valor),
  }));
}

export function ComponenteDialog({
  aberto,
  onOpenChange,
  computadorId,
  componente,
  tipos,
  onSaved,
}: Props) {
  const [compTipo, setCompTipo] = React.useState<string>("");
  const [compDescricao, setCompDescricao] = React.useState("");
  const [specs, setSpecs] = React.useState<Spec[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Inicializa ao abrir (edição → dados do componente; novo → primeiro tipo).
  React.useEffect(() => {
    if (!aberto) return;
    setErro(null);
    if (componente) {
      setCompTipo(componente.tipoId);
      setCompDescricao(componente.descricao);
      setSpecs(specsParaArray(componente.especificacoes));
    } else {
      setCompTipo(tipos[0]?.id ?? "");
      setCompDescricao("");
      setSpecs([]);
    }
  }, [aberto, componente, tipos]);

  function montarEspecificacoes(): Record<string, string> | null {
    const validos = specs.filter((s) => s.chave.trim() !== "");
    if (validos.length === 0) return null;
    const obj: Record<string, string> = {};
    for (const s of validos) obj[s.chave.trim()] = s.valor;
    return obj;
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const especificacoes = montarEspecificacoes();
    const body = componente
      ? { tipoId: compTipo, descricao: compDescricao, especificacoes }
      : {
          computadorId,
          tipoId: compTipo,
          descricao: compDescricao,
          especificacoes,
        };
    try {
      await apiSend(
        componente ? `/api/componentes/${componente.id}` : "/api/componentes",
        componente ? "PATCH" : "POST",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {componente ? "Editar componente" : "Adicionar componente"}
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
                onClick={() => setSpecs((s) => [...s, { chave: "", valor: "" }])}
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
                  onClick={() => setSpecs((arr) => arr.filter((_, j) => j !== i))}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || tipos.length === 0}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
