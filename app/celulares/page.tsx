"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { useFiltroUrl } from "@/hooks/use-filtro-url";
import { Filtros } from "@/components/celulares/filtros";
import { CelularCard } from "@/components/celulares/celular-card";
import { CelularDialog } from "@/components/celulares/celular-dialog";
import type { Celular, Funcionario } from "@/components/celulares/types";

export default function CelularesPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [celulares, setCelulares] = React.useState<Celular[]>([]);
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);

  // Filtros na URL: é o que permite o Dashboard e o perfil do funcionário
  // mandarem a pessoa para esta tela já filtrada.
  const [busca, setBusca] = useFiltroUrl("busca", "");
  const [filtroFunc, setFiltroFunc] = useFiltroUrl("funcionario", "todos");
  const [filtroCargo, setFiltroCargo] = useFiltroUrl("cargo", "todos");

  // diálogo (a tela só guarda "o que está aberto e com qual registro";
  // o estado do formulário vive dentro do diálogo)
  const [celDialog, setCelDialog] = React.useState<{
    aberto: boolean;
    celular: Celular | null;
  }>({ aberto: false, celular: null });

  async function carregarTudo() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      const [c, f] = await Promise.all([
        apiGet<Celular[]>("/api/celulares"),
        apiGet<Funcionario[]>("/api/funcionarios"),
      ]);
      setCelulares(c);
      setFuncionarios(f);
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

  const termo = busca.trim().toLowerCase();
  const filtrados = celulares.filter((c) => {
    if (filtroFunc === "sem" && c.funcionarioId) return false;
    if (filtroFunc === "com" && !c.funcionarioId) return false;
    if (filtroFunc !== "todos" && filtroFunc !== "sem" && filtroFunc !== "com") {
      if (c.funcionarioId !== filtroFunc) return false;
    }
    if (filtroCargo !== "todos") {
      if (c.funcionario?.cargo !== filtroCargo) return false;
    }
    if (termo) {
      const alvo = [
        c.identificador,
        c.apelido,
        c.numero,
        c.operadora,
        c.imei,
        c.funcionario?.nome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  async function remover(c: Celular) {
    const ok = await confirmar({
      titulo: `Remover o celular "${c.identificador}"?`,
      confirmar: "Remover",
    });
    if (!ok) return;
    setRemovendoId(c.id);
    try {
      await apiSend(`/api/celulares/${c.id}`, "DELETE");
      toast({ descricao: `Celular "${c.identificador}" removido.`, variante: "sucesso" });
      carregarTudo();
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
          <div className="eyebrow">inventário</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Celulares
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os aparelhos corporativos e a quem cada um pertence.
          </p>
        </div>
        <Button onClick={() => setCelDialog({ aberto: true, celular: null })}>
          <Plus /> Novo celular
        </Button>
      </div>

      <Filtros
        busca={busca}
        setBusca={setBusca}
        filtroFunc={filtroFunc}
        setFiltroFunc={setFiltroFunc}
        filtroCargo={filtroCargo}
        setFiltroCargo={setFiltroCargo}
        funcionarios={funcionarios}
        cargos={cargos}
        total={filtrados.length}
      />

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
          Nenhum celular encontrado.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtrados.map((c) => (
            <CelularCard
              key={c.id}
              celular={c}
              removendoId={removendoId}
              onEditar={(x) => setCelDialog({ aberto: true, celular: x })}
              onRemover={remover}
            />
          ))}
        </div>
      )}

      <CelularDialog
        aberto={celDialog.aberto}
        onOpenChange={(v) => setCelDialog((s) => ({ ...s, aberto: v }))}
        celular={celDialog.celular}
        funcionarios={funcionarios}
        onSaved={() => {
          setCelDialog({ aberto: false, celular: null });
          carregarTudo();
        }}
      />
    </div>
  );
}
