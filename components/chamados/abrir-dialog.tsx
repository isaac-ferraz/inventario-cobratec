"use client";

import * as React from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ContextoChamado } from "./types";

const CATEGORIAS = [
  "Computador não liga",
  "Internet / rede",
  "Impressora",
  "Sistema (Siscobra)",
  "Telefonia (Vonix)",
  "Celular",
  "Periférico (mouse, teclado, headset)",
  "Senha / acesso",
];

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: () => void;
};

export function AbrirChamadoDialog({ aberto, onOpenChange, onCriado }: Props) {
  const [titulo, setTitulo] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [equipamento, setEquipamento] = React.useState<string>("");
  const [contexto, setContexto] = React.useState<ContextoChamado | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setTitulo("");
    setDescricao("");
    setCategoria("");
    setEquipamento("");
    setErro(null);
    // Carrega o que é do próprio usuário para ele só apontar o equipamento.
    apiGet<ContextoChamado>("/api/chamados/contexto")
      .then(setContexto)
      .catch(() => setContexto({ computadores: [], celulares: [], sala: null }));
  }, [aberto]);

  async function enviar() {
    setSalvando(true);
    setErro(null);
    const [tipo, id] = equipamento ? equipamento.split(":") : [null, null];
    try {
      await apiSend("/api/chamados", "POST", {
        titulo,
        descricao,
        categoria,
        computadorId: tipo === "pc" ? id : null,
        celularId: tipo === "cel" ? id : null,
      });
      onCriado();
      onOpenChange(false);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  const temEquipamento =
    (contexto?.computadores.length ?? 0) + (contexto?.celulares.length ?? 0) > 0;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir chamado</DialogTitle>
          <DialogDescription>
            Conte o que está acontecendo. O TI recebe na hora e responde por
            aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ch-titulo">O que houve?</Label>
            <Input
              id="ch-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: O computador não liga"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-desc">Detalhes</Label>
            <Textarea
              id="ch-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              placeholder="Desde quando acontece, o que já tentou, mensagens de erro..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-cat">Tipo de problema (opcional)</Label>
            <Input
              id="ch-cat"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              list="categorias-chamado"
              placeholder="Escolha ou escreva"
            />
            <datalist id="categorias-chamado">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {temEquipamento && (
            <div className="space-y-1.5">
              <Label>É em qual equipamento? (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {contexto?.computadores.map((c) => {
                  const valor = `pc:${c.id}`;
                  const on = equipamento === valor;
                  return (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      onClick={() => setEquipamento(on ? "" : valor)}
                    >
                      <Monitor /> {c.apelido || c.identificador}
                    </Button>
                  );
                })}
                {contexto?.celulares.map((c) => {
                  const valor = `cel:${c.id}`;
                  const on = equipamento === valor;
                  return (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      aria-pressed={on}
                      onClick={() => setEquipamento(on ? "" : valor)}
                    >
                      <Smartphone /> {c.apelido || c.identificador}
                    </Button>
                  );
                })}
              </div>
              {contexto?.sala && (
                <p className={cn("text-xs text-muted-foreground")}>
                  O TI verá que você está na sala {contexto.sala.nome}.
                </p>
              )}
            </div>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={enviar}
            disabled={salvando || titulo.trim().length < 3 || !descricao.trim()}
          >
            {salvando && <Loader2 className="animate-spin" />}
            Enviar chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
