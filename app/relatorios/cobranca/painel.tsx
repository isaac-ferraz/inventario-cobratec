"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { apiGet, mensagem } from "@/lib/fetcher";
import { formatarMoeda } from "@/lib/ativos";
import { PERIODOS, hojeNoBrasil } from "@/lib/relatorios";
import { useFiltroLista, useFiltroUrl } from "@/hooks/use-filtro-url";
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
  FiltrosComuns,
  descreverRecorte,
  type ListasDeFiltro,
} from "@/components/relatorios/filtros-comuns";
import { ExportarDialog } from "@/components/relatorios/exportar-dialog";
import type { AbaChave, Papel } from "@/lib/relatorios-abas";
import {
  BarrasRanking,
  ColunasPorFaixa,
  Numero,
  TabelaFatias,
  TabelaMatriz,
  type Celula,
  type Ponto,
} from "@/components/relatorios/graficos";
import { cn } from "@/lib/utils";

// O painel de cobrança: o que a operação produziu no período escolhido.
//
// Todo filtro vive na URL (decisão 23), então o recorte que o gestor está
// olhando é um link — "olha a EQUIPE AZUL hoje" se manda pelo WhatsApp em vez
// de se descrever em três frases.

type Fatias = Ponto[];
type Resposta = {
  periodo: { inicio: string; fim: string; rotulo: string };
  acordos: {
    qtd: number;
    valor: number;
    porOperadora: Fatias;
    porCarteira: Fatias;
    porHora: Fatias;
    porMes: Fatias;
    matriz: { celulas: Celula[]; truncada: boolean };
  };
  acionamentos: {
    qtd: number;
    devedores: number;
    porOperadora: Fatias;
    porSituacao: Fatias;
    porHora: Fatias;
    porMes: Fatias;
  };
};

type Filtros = ListasDeFiltro;

const numero = (n: number) => n.toLocaleString("pt-BR");

// Cada gráfico diz o que é a SEGUNDA métrica dele: no acordo é dinheiro, no
// acionamento é gente distinta. É o que o hover mostra e o que a tabela repete.
const dinheiro = (p: Ponto) => formatarMoeda(p.valor);
const devedores = (p: Ponto) =>
  `${numero(p.valor)} ${p.valor === 1 ? "devedor" : "devedores"}`;

// As abas que ESTA tela sugere no diálogo. A carteira sugere as dela — quem
// abre o Excel a partir do painel de produção quer produção, não agenda.
const ABAS_SUGERIDAS: AbaChave[] = [
  "resumo",
  "acordos-operadora",
  "acordos-carteira",
  "acordos-matriz",
  "acionamentos-operadora",
];

export function PainelCobranca({ papel }: { papel: Papel }) {
  const [periodo, setPeriodo] = useFiltroUrl("periodo", "hoje");
  const [inicio, setInicio] = useFiltroUrl("inicio", "");
  const [fim, setFim] = useFiltroUrl("fim", "");
  // Listas, não valores únicos (decisão 39). A URL segue no singular:
  // `?carteira=12,45` — os links antigos com um código só continuam valendo.
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

  const consulta = React.useMemo(() => {
    const p = new URLSearchParams({ periodo });
    if (periodo === "personalizado") {
      if (inicio) p.set("inicio", inicio);
      if (fim) p.set("fim", fim);
    }
    if (equipe.length) p.set("equipe", equipe.join(","));
    if (carteira.length) p.set("carteira", carteira.join(","));
    if (operadora.length) p.set("operadora", operadora.join(","));
    return p.toString();
  }, [periodo, inicio, fim, equipe, carteira, operadora]);

  // Datas pela metade não viram consulta: pedir com uma ponta só devolveria um
  // erro que a pessoa ainda não cometeu — ela está no meio de escolher.
  const faltaData = periodo === "personalizado" && (!inicio || !fim);

  React.useEffect(() => {
    if (faltaData) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    apiGet<Resposta>(`/api/relatorios/cobranca?${consulta}`)
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

  // As listas dos seletores são carregadas uma vez: mudam quando alguém
  // cadastra uma carteira, não a cada troca de filtro.
  React.useEffect(() => {
    let vivo = true;
    apiGet<Filtros>("/api/relatorios/cobranca/filtros")
      .then((r) => vivo && setFiltros(r))
      // Falhar aqui não derruba o relatório: sem as listas, os seletores ficam
      // em "todas" e os números continuam certos.
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const recorte = React.useMemo(
    () =>
      descreverRecorte(filtros, {
        equipes: equipe,
        carteiras: carteira,
        operadoras: operadora,
      }),
    [filtros, equipe, carteira, operadora],
  );

  const acordos = dados?.acordos;
  const acionamentos = dados?.acionamentos;
  const ticket = acordos && acordos.qtd > 0 ? acordos.valor / acordos.qtd : null;

  return (
    <div className="space-y-5">
      {/* ─── Uma linha de filtros para a tela inteira ───
          Todos os blocos abaixo respondem a ela; filtro dentro de card faria
          dois gráficos lado a lado mostrarem recortes diferentes. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <label className="min-w-[9rem] flex-1 space-y-1">
          <span className="eyebrow">período</span>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.chave} value={p.chave}>
                  {p.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {periodo === "personalizado" && (
          <>
            <label className="space-y-1">
              <span className="eyebrow">de</span>
              <Input
                type="date"
                value={inicio}
                max={hojeNoBrasil()}
                onChange={(e) => setInicio(e.target.value)}
                className="w-[10rem]"
              />
            </label>
            <label className="space-y-1">
              <span className="eyebrow">até</span>
              <Input
                type="date"
                value={fim}
                max={hojeNoBrasil()}
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
            consulta={consulta}
            recorte={recorte}
            periodo={dados?.periodo.rotulo ?? "o período escolhido"}
            sugeridas={ABAS_SUGERIDAS}
          />
        </div>

        <div className="space-y-1">
          {/* `block` não é enfeite: o eyebrow é um <span>, e ao lado de um
              inline-flex ele fica na MESMA linha — o rótulo saía colado à
              esquerda dos botões, desalinhado dos outros três filtros. */}
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
          Escolha a data inicial e a final para ver o período.
        </p>
      )}

      {erro && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border tom-alerta p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{erro}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTentativa((t) => t + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      )}

      {dados && (
        // Durante a recarga o desenho ANTERIOR fica na tela, esmaecido. Trocar
        // tudo por esqueleto a cada mudança de filtro faz a página pular e
        // apaga a referência do que se estava comparando.
        <div
          className={cn(
            "space-y-5 transition-opacity",
            carregando && "pointer-events-none opacity-50",
          )}
          aria-busy={carregando}
        >
          <p className="text-sm text-muted-foreground">
            {dados.periodo.rotulo}
            {recorte ? ` · ${recorte}` : ""}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero
              rotulo="Acordos fechados"
              valor={numero(acordos!.qtd)}
              serie="acordo"
              detalhe={
                ticket ? `ticket médio ${formatarMoeda(ticket)}` : "no período"
              }
            />
            <Numero
              rotulo="Valor acordado"
              valor={formatarMoeda(acordos!.valor)}
              serie="acordo"
              detalhe="total negociado (com juros e multa)"
            />
            <Numero
              rotulo="Acionamentos"
              valor={numero(acionamentos!.qtd)}
              serie="acionamento"
              detalhe={`${numero(acionamentos!.devedores)} devedores distintos`}
            />
            <Numero
              rotulo="Operadoras com acordo"
              valor={numero(acordos!.porOperadora.length)}
              serie="acordo"
              detalhe={`de ${numero(acionamentos!.porOperadora.length)} que acionaram`}
            />
          </div>

          {/* ─── O gráfico que motivou a tela: acordo hora a hora ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">
                Acordos hora a hora
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Pela hora de gravação do acordo. Passe o mouse (ou use o Tab)
                para ver o valor de cada hora.
              </p>
            </CardHeader>
            <CardContent>
              <ColunasPorFaixa
                dados={acordos!.porHora}
                serie="acordo"
                formato={dinheiro}
                vazio="Nenhum acordo gravado neste período."
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Acordos por operadora
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={acordos!.porOperadora}
                    coluna="Operadora"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={acordos!.porOperadora}
                    serie="acordo"
                    formato={dinheiro}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Acordos por carteira
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={acordos!.porCarteira}
                    coluna="Carteira"
                    segunda="Valor"
                    formato={dinheiro}
                  />
                ) : (
                  <BarrasRanking
                    dados={acordos!.porCarteira}
                    serie="acordo"
                    formato={dinheiro}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <h2 className="eyebrow pt-1">acionamentos · ações manuais de cobrança</h2>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Acionamentos por operadora
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={acionamentos!.porOperadora}
                    coluna="Operadora"
                    segunda="Devedores"
                    formato={devedores}
                  />
                ) : (
                  <BarrasRanking
                    dados={acionamentos!.porOperadora}
                    serie="acionamento"
                    formato={devedores}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Acionamentos por situação
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  O mesmo corte do relatório “Ação de…” do Siscobra.
                </p>
              </CardHeader>
              <CardContent>
                {detalhado ? (
                  <TabelaFatias
                    dados={acionamentos!.porSituacao}
                    coluna="Situação"
                    segunda="Devedores"
                    formato={devedores}
                  />
                ) : (
                  <BarrasRanking
                    dados={acionamentos!.porSituacao}
                    serie="acionamento"
                    formato={devedores}
                    limite={8}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Só no detalhado: útil para ver o turno inteiro, mas não é a
              pergunta de abertura de ninguém. */}
          {detalhado && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">
                  Acionamentos hora a hora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ColunasPorFaixa
                  dados={acionamentos!.porHora}
                  serie="acionamento"
                  formato={devedores}
                  vazio="Nenhuma ação manual neste período."
                />
              </CardContent>
            </Card>
          )}

          {/* ─── O cruzamento, e o mês ───
              Os dois só no detalhado: respondem a segunda pergunta ("onde a
              Ana fez isso", "como está contra o mês passado"), e ocupariam a
              tela de abertura, que é a primeira. */}
          {detalhado && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">
                    Acordos por operadora e carteira
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Onde cada pessoa fez o que fez.
                  </p>
                </CardHeader>
                <CardContent>
                  <TabelaMatriz
                    celulas={acordos!.matriz.celulas}
                    truncada={acordos!.matriz.truncada}
                    segunda="Valor"
                    formato={dinheiro}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">
                    Acordos mês a mês
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Dentro do período escolhido — o teto é de 92 dias.
                  </p>
                </CardHeader>
                <CardContent>
                  <ColunasPorFaixa
                    dados={acordos!.porMes}
                    serie="acordo"
                    formato={dinheiro}
                    vazio="Nenhum acordo neste período."
                  />
                </CardContent>
              </Card>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium">Como estes números são contados.</strong>{" "}
            Acordo é o acordo ativo (o quebrado sai da conta), pelo valor total
            negociado e pela data em que foi gravado; ele é creditado a quem teve
            a última ação manual com o devedor, não a quem digitou. Acionamento é
            só ação manual — o retorno automático do discador fica de fora. As
            duas regras foram conferidas contra os relatórios oficiais do
            Siscobra. Leitura direta do CRM, sem gravar nada nele.
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
