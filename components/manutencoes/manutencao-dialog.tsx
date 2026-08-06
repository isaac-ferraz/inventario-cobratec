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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROTULO_TIPO_MANUTENCAO, TIPOS_MANUTENCAO } from "@/lib/ativos";
import type { Manutencao } from "./types";

// A data que o <input type="date"> entende.
function hoje() {
  return new Date().toISOString().slice(0, 10);
}
function paraInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

type EquipamentoOpcao = {
  valor: string; // "pc:<id>" | "cel:<id>"
  rotulo: string;
  tipo: "pc" | "cel";
};

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  manutencao: Manutencao | null; // null = nova
  // Pré-seleção ao abrir a partir de um chamado ou da ficha do equipamento.
  equipamentoInicial?: string;
  chamadoId?: string;
  onSalvo: () => void;
};

export function ManutencaoDialog({
  aberto,
  onOpenChange,
  manutencao,
  equipamentoInicial,
  chamadoId,
  onSalvo,
}: Props) {
  const editando = Boolean(manutencao);
  const [equipamento, setEquipamento] = React.useState("");
  const [opcoes, setOpcoes] = React.useState<EquipamentoOpcao[]>([]);
  const [tipo, setTipo] = React.useState<string>("corretiva");
  const [descricao, setDescricao] = React.useState("");
  const [fornecedor, setFornecedor] = React.useState("");
  const [custo, setCusto] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [concluidaEm, setConcluidaEm] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setTipo(manutencao?.tipo ?? "corretiva");
    setDescricao(manutencao?.descricao ?? "");
    setFornecedor(manutencao?.fornecedor ?? "");
    setCusto(manutencao?.custo != null ? String(manutencao.custo) : "");
    setObservacoes(manutencao?.observacoes ?? "");
    setConcluidaEm(paraInput(manutencao?.concluidaEm ?? null));
    setEquipamento(
      manutencao?.computador
        ? `pc:${manutencao.computador.id}`
        : manutencao?.celular
          ? `cel:${manutencao.celular.id}`
          : (equipamentoInicial ?? ""),
    );
  }, [aberto, manutencao, equipamentoInicial]);

  // A lista de equipamentos só é necessária ao ABRIR uma manutenção nova.
  React.useEffect(() => {
    if (!aberto || editando || equipamentoInicial) return;
    Promise.all([
      apiGet<{ id: string; identificador: string; apelido: string | null }[]>(
        "/api/computadores",
      ),
      apiGet<{ id: string; identificador: string; apelido: string | null }[]>(
        "/api/celulares",
      ),
    ])
      .then(([pcs, cels]) =>
        setOpcoes([
          ...pcs.map((c) => ({
            valor: `pc:${c.id}`,
            rotulo: c.apelido ? `${c.identificador} · ${c.apelido}` : c.identificador,
            tipo: "pc" as const,
          })),
          ...cels.map((c) => ({
            valor: `cel:${c.id}`,
            rotulo: c.apelido ? `${c.identificador} · ${c.apelido}` : c.identificador,
            tipo: "cel" as const,
          })),
        ]),
      )
      .catch(() => setOpcoes([]));
  }, [aberto, editando, equipamentoInicial]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const [alvo, id] = equipamento.split(":");
    const corpo: Record<string, unknown> = {
      tipo,
      descricao,
      fornecedor,
      custo,
      observacoes,
      concluidaEm,
    };
    if (!editando) {
      corpo.computadorId = alvo === "pc" ? id : "";
      corpo.celularId = alvo === "cel" ? id : "";
      if (chamadoId) corpo.chamadoId = chamadoId;
    }
    try {
      await apiSend(
        editando ? `/api/manutencoes/${manutencao!.id}` : "/api/manutencoes",
        editando ? "PATCH" : "POST",
        corpo,
      );
      onSalvo();
      onOpenChange(false);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  const rotuloEquipamento = manutencao?.computador
    ? manutencao.computador.identificador
    : manutencao?.celular
      ? manutencao.celular.identificador
      : opcoes.find((o) => o.valor === equipamento)?.rotulo;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar manutenção" : "Abrir manutenção"}
          </DialogTitle>
          <DialogDescription>
            {editando
              ? "Preencha a conclusão para devolver o equipamento ao uso."
              : "O equipamento passa para “Em manutenção” enquanto estiver no conserto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {editando || equipamentoInicial ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="eyebrow">equipamento</div>
              <div className="font-mono text-xs">
                {rotuloEquipamento ?? "—"}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Equipamento</Label>
              <Select value={equipamento} onValueChange={setEquipamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o computador ou celular" />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      <span className="inline-flex items-center gap-1.5">
                        {o.tipo === "pc" ? (
                          <Monitor className="h-3.5 w-3.5" />
                        ) : (
                          <Smartphone className="h-3.5 w-3.5" />
                        )}
                        {o.rotulo}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_MANUTENCAO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO_MANUTENCAO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-desc">O que está sendo feito</Label>
            <Textarea
              id="m-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Ex: troca da fonte queimada"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-forn">Fornecedor / assistência</Label>
              <Input
                id="m-forn"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-custo">Custo (R$)</Label>
              <Input
                id="m-custo"
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                placeholder="Ex: 250,00"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-conc">Concluída em</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="m-conc"
                type="date"
                value={concluidaEm}
                onChange={(e) => setConcluidaEm(e.target.value)}
                className="w-48"
              />
              {!concluidaEm && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConcluidaEm(hoje())}
                >
                  Concluir hoje
                </Button>
              )}
              {concluidaEm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConcluidaEm("")}
                >
                  Ainda no conserto
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Em branco = ainda no conserto. Ao concluir, o equipamento volta
              para “Ativo”.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-obs">Observações</Label>
            <Textarea
              id="m-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={
              salvando || !descricao.trim() || (!editando && !equipamento)
            }
          >
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
