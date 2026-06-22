"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import type { ItemDeposito } from "./types";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemDeposito | null; // null = novo
  categorias: string[]; // sugestões já existentes
  onSaved: () => void;
};

export function ItemDialog({
  aberto,
  onOpenChange,
  item,
  categorias,
  onSaved,
}: Props) {
  const [nome, setNome] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("0");
  const [quantidadeMinima, setQuantidadeMinima] = React.useState("0");
  const [localizacao, setLocalizacao] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setNome(item?.nome ?? "");
    setCategoria(item?.categoria ?? "");
    setQuantidade(String(item?.quantidade ?? 0));
    setQuantidadeMinima(String(item?.quantidadeMinima ?? 0));
    setLocalizacao(item?.localizacao ?? "");
    setObservacoes(item?.observacoes ?? "");
  }, [aberto, item]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const body = {
      nome,
      categoria,
      quantidade: quantidade === "" ? 0 : Number(quantidade),
      quantidadeMinima: quantidadeMinima === "" ? 0 : Number(quantidadeMinima),
      localizacao,
      observacoes,
    };
    try {
      await apiSend(
        item ? `/api/deposito/${item.id}` : "/api/deposito",
        item ? "PATCH" : "POST",
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
          <DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>
            Suprimentos avulsos do depósito (cabos, mouses, adaptadores...).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome do item</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Cabo HDMI 2m"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria">Categoria (opcional)</Label>
            <Input
              id="categoria"
              list="categorias-deposito"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex: Cabos, Periféricos, Adaptadores"
            />
            <datalist id="categorias-deposito">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qtd">Quantidade</Label>
              <Input
                id="qtd"
                type="number"
                min={0}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qtdmin">Estoque mínimo</Label>
              <Input
                id="qtdmin"
                type="number"
                min={0}
                value={quantidadeMinima}
                onChange={(e) => setQuantidadeMinima(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Abaixo disso o item entra como &quot;estoque baixo&quot;. 0 = sem
                alerta.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="local">Onde está (opcional)</Label>
            <Input
              id="local"
              value={localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
              placeholder="Ex: Caixa 3, Prateleira A"
            />
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
