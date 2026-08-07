"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Acao = "criar" | "editar" | "remover" | "mover";

type Log = {
  id: string;
  criadoEm: string;
  acao: Acao;
  entidade: string;
  entidadeId: string | null;
  descricao: string;
  ator: string | null;
};

const ENTIDADES = [
  "Computador",
  "Celular",
  "Componente",
  "Funcionario",
  "TipoComponente",
  "ItemDeposito",
];

const VARIANTE_ACAO: Record<
  Acao,
  "success" | "secondary" | "destructive" | "warning"
> = {
  criar: "success",
  editar: "secondary",
  remover: "destructive",
  mover: "warning",
};

export default function AuditoriaPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [logs, setLogs] = React.useState<Log[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState<string>("todas");
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const q = filtro === "todas" ? "" : `?entidade=${filtro}`;
      setLogs(await apiGet<Log[]>(`/api/auditoria${q}`));
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function remover(l: Log) {
    const ok = await confirmar({
      titulo: "Apagar este evento de auditoria?",
      descricao: "Esta ação é definitiva.",
      confirmar: "Apagar",
    });
    if (!ok) return;
    setRemovendoId(l.id);
    try {
      await apiSend(`/api/auditoria/${l.id}`, "DELETE");
      toast({ descricao: "Evento apagado do histórico.", variante: "sucesso" });
      setLogs((atual) => atual.filter((x) => x.id !== l.id));
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">histórico</div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          Histórico das alterações feitas no inventário (mais recentes primeiro).
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="font-display text-base">Eventos</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Entidade</Label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {ENTIDADES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
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
          ) : erro ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{erro}</p>
              <Button variant="outline" size="sm" onClick={carregar}>
                Tentar novamente
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Quando</TableHead>
                  <TableHead className="w-24">Ação</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-32">Responsável</TableHead>
                  <TableHead className="w-16 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(l.criadoEm).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_ACAO[l.acao]}>{l.acao}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{l.descricao}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.ator ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Apagar evento"
                        title="Apagar evento"
                        disabled={removendoId === l.id}
                        onClick={() => remover(l)}
                      >
                        {removendoId === l.id ? (
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
    </div>
  );
}
