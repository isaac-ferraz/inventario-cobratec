"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, MessageCircle, RefreshCw } from "lucide-react";
import { apiGet, mensagem } from "@/lib/fetcher";
import { formatarMoeda } from "@/lib/ativos";
// Sem `max` nas datas personalizadas, ao contrário do painel de cobrança: aqui
// a janela olha para FRENTE, e travar em hoje esvaziaria o filtro inteiro.
import { JANELAS, formatarDiaBr } from "@/lib/relatorios";
import { useFiltroLista, useFiltroUrl } from "@/hooks/use-filtro-url";
import {
  FiltrosComuns,
  descreverRecorte,
  type ListasDeFiltro,
} from "@/components/relatorios/filtros-comuns";
import { ExportarDialog } from "@/components/relatorios/exportar-dialog";
import type { AbaChave } from "@/lib/relatorios-abas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarrasRanking,
  ColunasPorFaixa,
  Numero,
  TabelaFatias,
  type Ponto,
} from "@/components/relatorios/graficos";
import type { Papel } from "@/lib/supervisao";
import { cn } from "@/lib/utils";

// O painel da carteira. Todo filtro vive na URL (decisão 23): "olha o atraso da
// EQUIPE AZUL" se manda por link em vez de se descrever em três frases.

type Fatias = Ponto[];
type Resposta = {
  janela: { inicio: string; fim: string; rotulo: string };
  hoje: string;
  aVencer: {
    qtd: number;
    valor: number;
    hoje: { qtd: number; valor: number };
    amanha: { qtd: number; valor: number };
    porDia: Fatias;
    porCarteira: Fatias;
    porOperadora: Fatias;
  };
  atraso: {
    qtd: number;
    valor: number;
    desde: string;
    porFaixa: Fatias;
    porCarteira: Fatias;
    porOperadora: Fatias;
  };
  quebras: { qtd: number; valor: number; porCarteira: Fatias; porOperadora: Fatias };
  primeira: { avaliados: number; pagos: number; valorPago: number; porCarteira: Fatias };
  janelas: { atrasoDias: number; quebrasDias: number; primeiraDias: number };
  podeVerOperadoras: boolean;
};

type Parcela = {
  acocod: number;
  devcod: number;
  parcela: number;
  nome: string;
  cpf: string;
  carteira: string;
  operadora: string | null;
  valor: number;
  vencimento: string;
  dias: number;
  conversa: { id: string; situacao: string } | null;
};

type Filtros = ListasDeFiltro;

const numero = (n: number) => n.toLocaleString("pt-BR");
const dinheiro = (p: Ponto) => formatarMoeda(p.valor);
/** Na primeira parcela a segunda métrica é "quantas foram honradas". */
const honradas = (p: Ponto) =>
  `${numero(p.valor)} de ${numero(p.qtd)} paga${p.valor === 1 ? "" : "s"}`;

// As abas que ESTA tela sugere: agenda e atraso, não produção. Quem abre o
// Excel a partir da carteira quer o que vem, não o que fechou.
const ABAS_SUGERIDAS: AbaChave[] = [
  "resumo",
  "carteira-a-vencer",
  "carteira-atraso",
  "carteira-quebras",
  "carteira-primeira",
];

export function PainelCarteira({ papel }: { papel: Papel }) {
  const [janela, setJanela] = useFiltroUrl("janela", "prox15");
  const [inicio, setInicio] = useFiltroUrl("inicio", "");
  const [fim, setFim] = useFiltroUrl("fim", "");
  // Listas, não valores únicos (decisão 39). A URL segue no singular.
  const [equipe, setEquipe] = useFiltroLista("equipe");
  const [carteira, setCarteira] = useFiltroLista("carteira");
  const [operadora, setOperadora] = useFiltroLista("operadora");
  const [visao, setVisao] = useFiltroUrl("visao", "resumo");
  const detalhado = visao === "detalhado";

  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [filtros, setFiltros] = React.useState<Filtros | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [tentativa, setTentativa] = React.useState(0);

  // A lista nominal NÃO carrega junto. É dado pessoal de devedor e a maior parte
  // das visitas a esta tela é para olhar o número agregado — puxar trezentos
  // nomes toda vez seria trafegar dado que ninguém pediu. Ela vem no clique.
  const podeLista = papel === "ADMIN" || papel === "COBRANCA";
  const [lista, setLista] = React.useState<Parcela[] | null>(null);
  const [listaTruncada, setListaTruncada] = React.useState(false);
  const [carregandoLista, setCarregandoLista] = React.useState(false);
  const [erroLista, setErroLista] = React.useState<string | null>(null);

  const consulta = React.useMemo(() => {
    const p = new URLSearchParams({ janela });
    if (janela === "personalizado") {
      if (inicio) p.set("inicio", inicio);
      if (fim) p.set("fim", fim);
    }
    if (equipe.length) p.set("equipe", equipe.join(","));
    if (carteira.length) p.set("carteira", carteira.join(","));
    if (operadora.length) p.set("operadora", operadora.join(","));
    return p.toString();
  }, [janela, inicio, fim, equipe, carteira, operadora]);

  // ─── a consulta da PLANILHA é outra, e precisa ser ───
  //
  // Esta tela chama de `inicio`/`fim` as pontas da JANELA (que olha para
  // frente). A rota de exportação usa esses dois nomes para o PERÍODO (que olha
  // para trás, e serve às abas de acordo e comissão) — ela carrega as duas
  // janelas porque uma planilha pode ter as duas metades.
  //
  // Mandar `inicio` cru daqui gravaria a data de vencimento como se fosse data
  // de fechamento de acordo: nenhum erro, e um número errado. O remapeamento é
  // explícito por isso.
  const consultaExport = React.useMemo(() => {
    const p = new URLSearchParams({ janela });
    if (janela === "personalizado") {
      if (inicio) p.set("janelaInicio", inicio);
      if (fim) p.set("janelaFim", fim);
    }
    if (equipe.length) p.set("equipe", equipe.join(","));
    if (carteira.length) p.set("carteira", carteira.join(","));
    if (operadora.length) p.set("operadora", operadora.join(","));
    return p.toString();
  }, [janela, inicio, fim, equipe, carteira, operadora]);

  const faltaData = janela === "personalizado" && (!inicio || !fim);

  React.useEffect(() => {
    if (faltaData) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    // A lista some quando o recorte muda: mantê-la na tela ao lado de números
    // de outro filtro mostraria duas verdades ao mesmo tempo.
    setLista(null);
    setErroLista(null);
    apiGet<Resposta>(`/api/relatorios/carteira?${consulta}`)
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setErro(null);
      })
      .catch((e) => vivo && setErro(mensagem(e)))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [consulta, faltaData, tentativa]);

  React.useEffect(() => {
    let vivo = true;
    apiGet<Filtros>("/api/relatorios/carteira/filtros")
      .then((r) => vivo && setFiltros(r))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  function carregarLista() {
    setCarregandoLista(true);
    setErroLista(null);
    apiGet<{ parcelas: Parcela[]; truncada: boolean }>(
      `/api/relatorios/carteira/lista?${consulta}`,
    )
      .then((r) => {
        setLista(r.parcelas);
        setListaTruncada(r.truncada);
      })
      .catch((e) => setErroLista(mensagem(e)))
      .finally(() => setCarregandoLista(false));
  }

  const recorte = React.useMemo(
    () =>
      descreverRecorte(filtros, {
        equipes: equipe,
        carteiras: carteira,
        operadoras: operadora,
      }),
    [filtros, equipe, carteira, operadora],
  );

  const aVencer = dados?.aVencer;
  const atraso = dados?.atraso;
  const primeira = dados?.primeira;
  const taxaPrimeira =
    primeira && primeira.avaliados > 0
      ? (primeira.pagos / primeira.avaliados) * 100
      : null;

  return (
    <div className="space-y-5">
      {/* ─── Uma linha de filtros para a tela inteira ─── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <label className="min-w-[10rem] flex-1 space-y-1">
          <span className="eyebrow">vencimento</span>
          <Select value={janela} onValueChange={setJanela}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JANELAS.map((j) => (
                <SelectItem key={j.chave} value={j.chave}>
                  {j.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {janela === "personalizado" && (
          <>
            <label className="space-y-1">
              <span className="eyebrow">de</span>
              <Input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-[10rem]"
              />
            </label>
            <label className="space-y-1">
              <span className="eyebrow">até</span>
              <Input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="w-[10rem]"
              />
            </label>
          </>
        )}

        <FiltrosComuns
          listas={filtros}
          equipes={equipe}
          aoMudarEquipes={setEquipe}
          carteiras={carteira}
          aoMudarCarteiras={setCarteira}
          operadoras={operadora}
          aoMudarOperadoras={setOperadora}
        />

        <div className="space-y-1">
          <span className="eyebrow block">planilha</span>
          <ExportarDialog
            papel={papel}
            consulta={consultaExport}
            recorte={recorte}
            periodo={dados?.janela.rotulo ?? "a janela escolhida"}
            sugeridas={ABAS_SUGERIDAS}
          />
        </div>

        <div className="space-y-1">
          <span className="eyebrow block">visão</span>
          <div className="inline-flex gap-0.5 rounded-md border bg-muted/50 p-0.5">
            {[
              { v: "resumo", r: "Resumo" },
              { v: "detalhado", r: "Detalhado" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                aria-pressed={visao === o.v}
                onClick={() => setVisao(o.v)}
                className={cn(
                  "rounded-[3px] px-3 py-1.5 text-sm transition-colors",
                  visao === o.v
                    ? "bg-card font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {faltaData && (
        <p className="rounded-md border tom-alerta p-3 text-sm">
          Escolha a data inicial e a final para ver a janela.
        </p>
      )}

      {erro && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border tom-alerta p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{erro}</span>
          <Button size="sm" variant="outline" onClick={() => setTentativa((t) => t + 1)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {dados && (
        <div
          className={cn(
            "space-y-5 transition-opacity",
            carregando && "pointer-events-none opacity-50",
          )}
          aria-busy={carregando}
        >
          <p className="text-sm text-muted-foreground">
            Vencimentos de {dados.janela.rotulo}
            {recorte ? ` · ${recorte}` : ""}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero
              rotulo="Vence hoje"
              valor={numero(aVencer!.hoje.qtd)}
              serie="aVencer"
              detalhe={formatarMoeda(aVencer!.hoje.valor)}
            />
            <Numero
              rotulo="Vence amanhã"
              valor={numero(aVencer!.amanha.qtd)}
              serie="aVencer"
              detalhe={formatarMoeda(aVencer!.amanha.valor)}
            />
            <Numero
              rotulo="A vencer na janela"
              valor={numero(aVencer!.qtd)}
              serie="aVencer"
              detalhe={formatarMoeda(aVencer!.valor)}
            />
            <Numero
              rotulo="Em atraso"
              valor={numero(atraso!.qtd)}
              serie="atraso"
              detalhe={`${formatarMoeda(atraso!.valor)} · desde ${formatarDiaBr(atraso!.desde)}`}
            />
          </div>

          {/* ─── A agenda: o gráfico que motivou a tela ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">
                Agenda de vencimento
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Parcelas de acordo ativo, por dia de vencimento. Passe o mouse
                (ou use o Tab) para ver o valor de cada dia.
              </p>
            </CardHeader>
            <CardContent>
              <ColunasPorFaixa
                dados={aVencer!.porDia}
                serie="aVencer"
                formato={dinheiro}
                eixo="dia"
                vazio="Nada a vencer nesta janela."
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Atraso por faixa
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Quanto tempo faz que venceu. A escada importa mais que a
                  altura: peso nas faixas longas é carteira que não volta.
                </p>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={atraso!.porFaixa}
                    coluna="Faixa"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={atraso!.porFaixa}
                    serie="atraso"
                    formato={dinheiro}
                    limite={5}
                    vazio="Nada em atraso na janela varrida."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  A vencer por carteira
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={aVencer!.porCarteira}
                    coluna="Carteira"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={aVencer!.porCarteira}
                    serie="aVencer"
                    formato={dinheiro}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Atraso por carteira
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={atraso!.porCarteira}
                    coluna="Carteira"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={atraso!.porCarteira}
                    serie="atraso"
                    formato={dinheiro}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>

            {/* ─── O sinal que ninguém media: a primeira parcela ─── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Primeira parcela honrada
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Acordos fechados nos últimos {dados.janelas.primeiraDias} dias
                  cuja 1ª parcela já venceu. É o divisor entre acordo que vinga e
                  acordo que só ocupou a agenda.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-display text-3xl font-bold leading-none",
                      taxaPrimeira !== null && taxaPrimeira < 50 && "num-alerta",
                    )}
                  >
                    {taxaPrimeira === null ? "—" : `${taxaPrimeira.toFixed(0)}%`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {numero(primeira!.pagos)} de {numero(primeira!.avaliados)}{" "}
                    acordos
                  </span>
                </div>
                {detalhado ? (
                  <TabelaFatias
                    dados={primeira!.porCarteira}
                    coluna="Carteira"
                    segunda="Honradas"
                    formato={honradas}
                  />
                ) : (
                  <BarrasRanking
                    dados={primeira!.porCarteira}
                    serie="aVencer"
                    formato={honradas}
                    limite={6}
                    vazio="Nenhum acordo recente com parcela já vencida."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Recortes por operadora: só para quem avalia equipe ───
              A operadora de cobrança não recebe estas listas do servidor
              (decisão 35: relatório nominal de colegas não é assunto dela). */}
          {dados.podeVerOperadoras && (
            <>
              <h2 className="eyebrow pt-1">
                por operadora · quem fechou o acordo responde pelo boleto
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-base">
                      A vencer por operadora
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detalhado ? (
                      <TabelaFatias
                        dados={aVencer!.porOperadora}
                        coluna="Operadora"
                        segunda="Valor"
                        formato={dinheiro}
                      />
                    ) : (
                      <BarrasRanking
                        dados={aVencer!.porOperadora}
                        serie="aVencer"
                        formato={dinheiro}
                        limite={8}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-base">
                      Atraso por operadora
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {detalhado ? (
                      <TabelaFatias
                        dados={atraso!.porOperadora}
                        coluna="Operadora"
                        segunda="Valor"
                        formato={dinheiro}
                      />
                    ) : (
                      <BarrasRanking
                        dados={atraso!.porOperadora}
                        serie="atraso"
                        formato={dinheiro}
                        limite={8}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* ─── Quebras ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">
                Acordos quebrados · últimos {dados.janelas.quebrasDias} dias
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                O acordo quebrado sai da conta do relatório de produção — aqui
                ele é o assunto. Fechar e quebrar não é produção, é retrabalho.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-display text-3xl font-bold leading-none",
                    dados.quebras.qtd > 0 && "num-alerta",
                  )}
                >
                  {numero(dados.quebras.qtd)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatarMoeda(dados.quebras.valor)} que voltaram para a régua
                </span>
              </div>
              {dados.quebras.qtd > 0 &&
                (detalhado ? (
                  <TabelaFatias
                    dados={dados.quebras.porCarteira}
                    coluna="Carteira"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={dados.quebras.porCarteira}
                    serie="atraso"
                    formato={dinheiro}
                    limite={6}
                  />
                ))}
            </CardContent>
          </Card>

          {/* ─── A lista nominal ─── */}
          {podeLista && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  De quem cobrar
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Parcelas da janela sem baixa localizada, com nome do devedor.
                  Não carrega sozinha: é dado pessoal, e a maior parte das
                  visitas a esta tela é para olhar o número.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {!lista && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={carregarLista}
                    disabled={carregandoLista}
                  >
                    {carregandoLista ? "Carregando…" : "Carregar lista"}
                  </Button>
                )}
                {erroLista && (
                  <p className="rounded-md border tom-alerta p-2 text-sm">{erroLista}</p>
                )}
                {lista && lista.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground">
                    Nenhuma parcela em aberto nesta janela.
                  </p>
                )}
                {lista && lista.length > 0 && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-1.5 pr-3 font-medium text-muted-foreground">
                              Devedor
                            </th>
                            <th className="py-1.5 pr-3 font-medium text-muted-foreground">
                              Carteira
                            </th>
                            <th className="py-1.5 pr-3 text-right font-medium text-muted-foreground">
                              Valor
                            </th>
                            <th className="py-1.5 pr-3 font-medium text-muted-foreground">
                              Vence
                            </th>
                            <th className="py-1.5 font-medium text-muted-foreground">
                              Conversa
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((p) => (
                            <tr
                              key={`${p.acocod}-${p.parcela}`}
                              className="border-b last:border-0"
                            >
                              <td className="py-1.5 pr-3">
                                <div className="truncate">{p.nome}</div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {p.cpf} · parcela {p.parcela}
                                </div>
                              </td>
                              <td className="py-1.5 pr-3 text-muted-foreground">
                                {p.carteira}
                              </td>
                              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                                {formatarMoeda(p.valor)}
                              </td>
                              <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                                {formatarDiaBr(p.vencimento)}
                                <span
                                  className={cn(
                                    "ml-1.5",
                                    p.dias < 0 ? "num-alerta" : "text-muted-foreground",
                                  )}
                                >
                                  {p.dias < 0
                                    ? `${-p.dias}d atrás`
                                    : p.dias === 0
                                      ? "hoje"
                                      : `em ${p.dias}d`}
                                </span>
                              </td>
                              <td className="py-1.5">
                                {p.conversa ? (
                                  <Link
                                    href={`/chat?conversa=${p.conversa.id}`}
                                    className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                                  >
                                    <MessageCircle className="h-3 w-3" />
                                    {p.conversa.situacao}
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {listaTruncada && (
                      <p className="eyebrow">
                        lista cortada no teto · filtre por carteira ou encurte a
                        janela para vê-la inteira
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium">Como estes números são contados.</strong>{" "}
            A parcela vem de <code className="font-mono">acordo_parcela</code>, de
            acordo ativo, pelo valor lançado e pela data de vencimento — dados
            confiáveis do CRM. Já{" "}
            <strong className="font-medium">“em atraso” quer dizer “venceu e não
            achamos a baixa”</strong>, e não “o devedor não pagou”: não existe
            coluna de pagamento na parcela, então o pagamento é procurado no razão
            de baixa dos boletos, casando acordo, número da parcela, devedor e
            carteira. Esse caminho é reconhecidamente parcial. O atraso varre os
            últimos {dados.janelas.atrasoDias} dias. Leitura direta do Siscobra,
            sem gravar nada nele.
          </p>
        </div>
      )}

      {!dados && carregando && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Consultando o Siscobra…
        </p>
      )}
    </div>
  );
}
