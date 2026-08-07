"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { useFiltroUrl, useLimparFiltros } from "@/hooks/use-filtro-url";
import { acharPendencia } from "@/lib/pendencias";
import { estadoGarantia } from "@/lib/ativos";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { Filtros } from "@/components/computadores/filtros";
import { ComputadorCard } from "@/components/computadores/computador-card";
import { ComputadorDialog } from "@/components/computadores/computador-dialog";
import { ComponenteDialog } from "@/components/computadores/componente-dialog";
import type {
  Componente,
  Computador,
  Funcionario,
  Sala,
  Tipo,
} from "@/components/computadores/types";

// Os parâmetros que "Limpar filtros" apaga da URL.
const CHAVES_FILTRO = [
  "busca",
  "funcionario",
  "cargo",
  "sala",
  "situacao",
  "pendencia",
  "tipo",
  "garantia",
];

export default function ComputadoresPage() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [computadores, setComputadores] = React.useState<Computador[]>([]);
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([]);
  const [salas, setSalas] = React.useState<Sala[]>([]);
  const [tipos, setTipos] = React.useState<Tipo[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [carregaErro, setCarregaErro] = React.useState<string | null>(null);
  const [removendoPcId, setRemovendoPcId] = React.useState<string | null>(null);
  const [removendoCompId, setRemovendoCompId] = React.useState<string | null>(
    null,
  );

  // Filtros na URL (e não em useState): é o que permite o Dashboard mandar a
  // pessoa para esta tela já filtrada. Ver hooks/use-filtro-url.ts.
  const [busca, setBusca] = useFiltroUrl("busca", "");
  const [filtroFunc, setFiltroFunc] = useFiltroUrl("funcionario", "todos");
  const [filtroCargo, setFiltroCargo] = useFiltroUrl("cargo", "todos");
  const [filtroSala, setFiltroSala] = useFiltroUrl("sala", "todos");
  const [filtroSituacao, setFiltroSituacao] = useFiltroUrl("situacao", "todas");
  const [filtroPendencia, setFiltroPendencia] = useFiltroUrl("pendencia", "todas");
  const [filtroTipo, setFiltroTipo] = useFiltroUrl("tipo", "todos");
  const [filtroGarantia, setFiltroGarantia] = useFiltroUrl("garantia", "todas");
  const limparFiltros = useLimparFiltros(CHAVES_FILTRO);

  // diálogos (a tela só guarda "o que está aberto e com qual registro";
  // o estado do formulário vive dentro de cada diálogo)
  const [pcDialog, setPcDialog] = React.useState<{
    aberto: boolean;
    computador: Computador | null;
  }>({ aberto: false, computador: null });
  const [compDialog, setCompDialog] = React.useState<{
    aberto: boolean;
    computadorId: string;
    componente: Componente | null;
  }>({ aberto: false, computadorId: "", componente: null });

  async function carregarTudo() {
    setCarregando(true);
    setCarregaErro(null);
    try {
      const [c, f, s, t] = await Promise.all([
        apiGet<Computador[]>("/api/computadores"),
        apiGet<Funcionario[]>("/api/funcionarios"),
        apiGet<Sala[]>("/api/salas"),
        apiGet<Tipo[]>("/api/tipos"),
      ]);
      setComputadores(c);
      setFuncionarios(f);
      setSalas(s);
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

  const termo = busca.trim().toLowerCase();
  const pendencia = acharPendencia(filtroPendencia);
  const filtrados = computadores.filter((c) => {
    // "com" = qualquer dono (é o "Computadores em uso" do Dashboard).
    if (filtroFunc === "sem" && c.funcionarioId) return false;
    if (filtroFunc === "com" && !c.funcionarioId) return false;
    if (filtroFunc !== "todos" && filtroFunc !== "sem" && filtroFunc !== "com") {
      if (c.funcionarioId !== filtroFunc) return false;
    }
    if (filtroCargo !== "todos") {
      if (c.funcionario?.cargo !== filtroCargo) return false;
    }
    if (filtroSituacao !== "todas" && c.situacao !== filtroSituacao) return false;
    if (filtroSala === "sem" && c.salaId) return false;
    if (filtroSala !== "todos" && filtroSala !== "sem") {
      if (c.salaId !== filtroSala) return false;
    }
    if (pendencia && !pendencia.falta(c)) return false;
    if (filtroTipo !== "todos") {
      if (!c.componentes.some((comp) => comp.tipo.id === filtroTipo)) return false;
    }
    if (filtroGarantia !== "todas") {
      if (estadoGarantia(c.garantiaAte) !== filtroGarantia) return false;
    }
    if (termo) {
      const alvo = [
        c.identificador,
        c.apelido,
        c.loginPadrao,
        c.contaOutlook,
        c.funcionario?.nome,
        c.sala?.nome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  async function removerPc(c: Computador) {
    const ok = await confirmar({
      titulo: `Remover o computador "${c.identificador}"?`,
      descricao: `Os ${c.componentes.length} componente(s) serão removidos junto.`,
      confirmar: "Remover",
    });
    if (!ok) return;
    setRemovendoPcId(c.id);
    try {
      await apiSend(`/api/computadores/${c.id}`, "DELETE");
      toast({ descricao: `Computador "${c.identificador}" removido.`, variante: "sucesso" });
      carregarTudo();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setRemovendoPcId(null);
    }
  }

  async function removerComp(comp: Componente) {
    const ok = await confirmar({
      titulo: `Remover o componente "${comp.descricao}"?`,
      confirmar: "Remover",
    });
    if (!ok) return;
    setRemovendoCompId(comp.id);
    try {
      await apiSend(`/api/componentes/${comp.id}`, "DELETE");
      toast({ descricao: "Componente removido.", variante: "sucesso" });
      carregarTudo();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setRemovendoCompId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">inventário</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Computadores
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie máquinas, hardware e a quem cada uma pertence.
          </p>
        </div>
        <Button onClick={() => setPcDialog({ aberto: true, computador: null })}>
          <Plus /> Novo computador
        </Button>
      </div>

      <Filtros
        busca={busca}
        setBusca={setBusca}
        filtroFunc={filtroFunc}
        setFiltroFunc={setFiltroFunc}
        filtroCargo={filtroCargo}
        setFiltroCargo={setFiltroCargo}
        filtroSala={filtroSala}
        setFiltroSala={setFiltroSala}
        filtroSituacao={filtroSituacao}
        setFiltroSituacao={setFiltroSituacao}
        filtroPendencia={filtroPendencia}
        setFiltroPendencia={setFiltroPendencia}
        filtroTipo={filtroTipo}
        setFiltroTipo={setFiltroTipo}
        filtroGarantia={filtroGarantia}
        setFiltroGarantia={setFiltroGarantia}
        onLimpar={limparFiltros}
        funcionarios={funcionarios}
        salas={salas}
        tipos={tipos}
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
          Nenhum computador encontrado.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtrados.map((c) => (
            <ComputadorCard
              key={c.id}
              computador={c}
              removendoPcId={removendoPcId}
              removendoCompId={removendoCompId}
              onEditar={(x) => setPcDialog({ aberto: true, computador: x })}
              onRemover={removerPc}
              onNovoComp={(pcId) =>
                setCompDialog({
                  aberto: true,
                  computadorId: pcId,
                  componente: null,
                })
              }
              onEditarComp={(pcId, comp) =>
                setCompDialog({
                  aberto: true,
                  computadorId: pcId,
                  componente: comp,
                })
              }
              onRemoverComp={removerComp}
            />
          ))}
        </div>
      )}

      <ComputadorDialog
        aberto={pcDialog.aberto}
        onOpenChange={(v) => setPcDialog((s) => ({ ...s, aberto: v }))}
        computador={pcDialog.computador}
        funcionarios={funcionarios}
        salas={salas}
        onSaved={() => {
          setPcDialog({ aberto: false, computador: null });
          carregarTudo();
        }}
      />

      <ComponenteDialog
        aberto={compDialog.aberto}
        onOpenChange={(v) => setCompDialog((s) => ({ ...s, aberto: v }))}
        computadorId={compDialog.computadorId}
        componente={compDialog.componente}
        tipos={tipos}
        onSaved={() => {
          setCompDialog({ aberto: false, computadorId: "", componente: null });
          carregarTudo();
        }}
      />
    </div>
  );
}
