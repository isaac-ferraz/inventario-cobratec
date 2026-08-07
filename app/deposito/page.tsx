"use client";

import * as React from "react";
import { Boxes, Loader2, PackageX, Plus, Search, TriangleAlert } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ItemCard } from "@/components/deposito/item-card";
import { ItemDialog } from "@/components/deposito/item-dialog";
import { situacao, type ItemDeposito } from "@/components/deposito/types";
import { cn } from "@/lib/utils";

export default function DepositoPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [itens, setItens] = React.useState<ItemDeposito[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);

  // filtros
  const [busca, setBusca] = React.useState("");
  const [filtroCat, setFiltroCat] = React.useState<string>("todas");

  const [dialog, setDialog] = React.useState<{
    aberto: boolean;
    item: ItemDeposito | null;
  }>({ aberto: false, item: null });

  async function carregar() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      setItens(await apiGet<ItemDeposito[]>("/api/deposito"));
    } catch (e) {
      setCarregaErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }

  React.useEffect(() => {
    carregar();
  }, []);

  const categorias = React.useMemo(
    () =>
      [...new Set(itens.map((i) => i.categoria).filter(Boolean))].sort() as string[],
    [itens],
  );

  // Resumo "do que tem e do que não tem".
  const totalTipos = itens.length;
  const totalUnidades = itens.reduce((s, i) => s + i.quantidade, 0);
  const emFalta = itens.filter((i) => situacao(i) === "falta").length;
  const estoqueBaixo = itens.filter((i) => situacao(i) === "baixo").length;

  const termo = busca.trim().toLowerCase();
  const filtrados = itens.filter((i) => {
    if (filtroCat !== "todas") {
      if (filtroCat === "sem" ? i.categoria : i.categoria !== filtroCat) {
        return false;
      }
    }
    if (termo) {
      const alvo = [i.nome, i.categoria, i.localizacao]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  // Ajuste rápido de quantidade (botões ±) com atualização otimista.
  async function ajustar(item: ItemDeposito, delta: number) {
    if (delta < 0 && item.quantidade <= 0) return;
    const novaPrevista = Math.max(0, item.quantidade + delta);
    setItens((atual) =>
      atual.map((x) =>
        x.id === item.id ? { ...x, quantidade: novaPrevista } : x,
      ),
    );
    try {
      const salvo = await apiSend<ItemDeposito>(
        `/api/deposito/${item.id}`,
        "PATCH",
        { delta },
      );
      // Reconcilia com o valor real do servidor.
      setItens((atual) =>
        atual.map((x) => (x.id === salvo.id ? { ...x, ...salvo } : x)),
      );
    } catch (e) {
      toastErro(mensagem(e));
      carregar(); // desfaz o otimismo recarregando o estado real
    }
  }

  async function remover(item: ItemDeposito) {
    const ok = await confirmar({
      titulo: `Remover o item "${item.nome}" do depósito?`,
      confirmar: "Remover",
    });
    if (!ok) return;
    setRemovendoId(item.id);
    try {
      await apiSend(`/api/deposito/${item.id}`, "DELETE");
      toast({ descricao: `"${item.nome}" removido do depósito.`, variante: "sucesso" });
      setItens((atual) => atual.filter((x) => x.id !== item.id));
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setRemovendoId(null);
    }
  }

  const kpis = [
    { titulo: "Tipos de item", valor: totalTipos, icon: Boxes, alerta: false },
    { titulo: "Unidades no total", valor: totalUnidades, icon: Boxes, alerta: false },
    { titulo: "Em falta", valor: emFalta, icon: PackageX, alerta: emFalta > 0 },
    {
      titulo: "Estoque baixo",
      valor: estoqueBaixo,
      icon: TriangleAlert,
      alerta: estoqueBaixo > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">almoxarifado</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Depósito
          </h1>
          <p className="text-sm text-muted-foreground">
            Contagem dos suprimentos avulsos (cabos, mouses, adaptadores...) — o
            que tem e o que está em falta.
          </p>
        </div>
        <Button onClick={() => setDialog({ aberto: true, item: null })}>
          <Plus /> Novo item
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.titulo} className="relative overflow-hidden">
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-0.5",
                k.alerta ? "bg-amber-500" : "bg-primary",
              )}
            />
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{k.titulo}</span>
                <k.icon
                  className={cn(
                    "h-4 w-4",
                    k.alerta ? "text-amber-500" : "text-muted-foreground",
                  )}
                />
              </div>
              <div
                className={cn(
                  "mt-2 font-display text-3xl font-bold tabular-nums",
                  k.alerta && "text-amber-600",
                )}
              >
                {k.valor}
              </div>
            </CardContent>
          </Card>
        ))}
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
                placeholder="Nome, categoria, caixa..."
                className="w-64 pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={filtroCat} onValueChange={setFiltroCat}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="sem">— Sem categoria —</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(busca !== "" || filtroCat !== "todas") && (
            <Button
              variant="ghost"
              onClick={() => {
                setBusca("");
                setFiltroCat("todas");
              }}
            >
              Limpar filtros
            </Button>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {filtrados.length} item(ns)
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
          <Button variant="outline" size="sm" onClick={carregar}>
            Tentar novamente
          </Button>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {itens.length === 0
            ? "Nenhum item no depósito ainda. Clique em “Novo item” para começar a contagem."
            : "Nenhum item encontrado com esses filtros."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              removendoId={removendoId}
              onAjustar={ajustar}
              onEditar={(x) => setDialog({ aberto: true, item: x })}
              onRemover={remover}
            />
          ))}
        </div>
      )}

      <ItemDialog
        aberto={dialog.aberto}
        onOpenChange={(v) => setDialog((s) => ({ ...s, aberto: v }))}
        item={dialog.item}
        categorias={categorias}
        onSaved={() => {
          setDialog({ aberto: false, item: null });
          carregar();
        }}
      />
    </div>
  );
}
