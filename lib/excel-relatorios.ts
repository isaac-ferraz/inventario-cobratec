// A planilha dos relatórios do CRM — montada sob medida (decisão 39).
//
// ─────────────────────────── por que não é a mesma ───────────────────────────
//
// `lib/excel.ts` exporta o INVENTÁRIO: um retrato do banco local, sempre com as
// mesmas quatro abas, sempre com tudo. Este exporta os RELATÓRIOS do Siscobra,
// e as duas diferenças mandam no desenho:
//
//   • O recorte é escolhido pela pessoa. A planilha sai do filtro que ela montou
//     na tela, e por isso a aba "Parâmetros" é OBRIGATÓRIA — uma planilha de
//     números sem o recorte que os produziu circula por e-mail e vira um número
//     sem dono. Foi para não ter esse problema que a decisão 23 pôs o filtro na
//     URL; a planilha não pode desfazê-lo.
//   • As abas são opcionais, e cada uma custa uma varredura num banco de
//     produção. Marcar quinze é pedir quinze consultas.
//
// ───────────────────────── o recorte por papel é aqui ─────────────────────────
//
// Cada aba declara quem pode levá-la, e a rota recusa o pedido NOMEANDO a aba
// fora do alcance — em vez de entregá-la vazia. Vazio silencioso é a doença que
// a decisão 30 pagou para aprender: o gateway entregava, o app respondia 200 e
// não havia rastro.
//
// A matriz da decisão 36 sai intacta: supervisor nunca vê nome de devedor,
// cobrança nunca vê ranking de colega.
import ExcelJS from "exceljs";
import {
  BORDA_LEVE,
  COR_BARRA,
  COR_CABECALHO,
  COR_TEXTO_CABECALHO,
  FMT_INTEIRO,
  FMT_MOEDA,
  adicionarBlocoIndicador,
  aplicarEscalaCor,
  cartaoKpi,
  estilizarCabecalho,
  faixaTitulo,
  formatarColuna,
  isoParaBR,
  ligarAutoFiltro,
  type LinhaIndicador,
} from "@/lib/excel-estilo";
import { comGraficos, type PedidoGrafico } from "@/lib/excel-graficos";
import { comSlicers, type PedidoSlicer } from "@/lib/excel-slicers";
import type { Acionamentos, Acordos, Fatia, Filtro } from "@/lib/relatorios-cobranca";
import type {
  AVencer,
  EmAtraso,
  ParcelaNominal,
  PrimeiraParcela,
  Quebras,
} from "@/lib/relatorios-carteira";
import type { Comissao } from "@/lib/relatorios-comissao";
import { abaDe, type AbaChave } from "@/lib/relatorios-abas";

export * from "@/lib/relatorios-abas";

// ────────────────────────── o que a rota entrega aqui ──────────────────────────

export type DadosDaPlanilha = {
  acordos?: Acordos;
  acionamentos?: Acionamentos;
  aVencer?: AVencer;
  atraso?: EmAtraso;
  quebras?: Quebras;
  primeira?: PrimeiraParcela;
  comissao?: Comissao;
  parcelas?: ParcelaNominal[];
  parcelasTruncadas?: boolean;
};

export type Contexto = {
  /** Janela para trás — acordos, acionamentos, comissão. */
  periodo: { inicio: string; fim: string; rotulo: string };
  /** Janela para frente — o que vence e a lista nominal. */
  janela: { inicio: string; fim: string; rotulo: string };
  hoje: string;
  filtro: Filtro;
  /** Nomes legíveis do recorte, resolvidos pela rota a partir dos códigos. */
  recorte: { carteiras: string[]; equipes: string[]; operadoras: string[] };
  exportadoPor: string;
  exportadoEm: Date;
  abas: AbaChave[];
};

// ────────────────────────────── as abas em si ──────────────────────────────

/** Cabeçalho + linhas, com borda, largura e autofiltro. É o formato de 9 abas. */
function abaTabela(
  wb: ExcelJS.Workbook,
  nome: string,
  colunas: { header: string; key: string; width: number }[],
  linhas: Record<string, unknown>[],
  formatos: Record<string, string> = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas;
  estilizarCabecalho(ws.getRow(1));
  for (const l of linhas) {
    const row = ws.addRow(l);
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }
  for (const [chave, fmt] of Object.entries(formatos)) formatarColuna(ws, chave, fmt);
  ligarAutoFiltro(ws, colunas.length);
  // Aba sem linha nenhuma é resposta legítima ("ninguém fechou acordo ontem") e
  // precisa dizer isso — senão parece que a exportação falhou.
  if (linhas.length === 0) {
    const r = ws.addRow({ [colunas[0].key]: "(nenhum registro no recorte escolhido)" });
    r.font = { italic: true, color: { argb: "FF6B7280" } };
  }
  return ws;
}

function fatiasParaLinhas(
  fatias: Fatia[],
  nomeChave: string,
  nomeSegunda: string,
): Record<string, unknown>[] {
  return fatias.map((f) => ({
    [nomeChave]: f.rotulo,
    qtd: f.qtd,
    [nomeSegunda]: f.valor,
  }));
}

function abaFatias(
  wb: ExcelJS.Workbook,
  nome: string,
  rotuloChave: string,
  fatias: Fatia[],
  segunda: { header: string; fmt: string },
) {
  abaTabela(
    wb,
    nome,
    [
      { header: rotuloChave, key: "chave", width: 34 },
      { header: "Quantidade", key: "qtd", width: 14 },
      { header: segunda.header, key: "valor", width: 18 },
    ],
    fatiasParaLinhas(fatias, "chave", "valor"),
    { qtd: FMT_INTEIRO, valor: segunda.fmt },
  );
}

/**
 * A aba "Parâmetros" — a que não é opcional.
 *
 * Ela é a única do arquivo que não tem número nenhum, e é a mais importante:
 * é o que separa "a planilha do Alberto" de "a planilha". Traz o recorte por
 * extenso, as duas janelas (as consultas olham para lados opostos do tempo),
 * quem exportou, quando, e as ressalvas de método que a tela mostra no rodapé.
 */
function abaParametros(wb: ExcelJS.Workbook, ctx: Contexto, dados: DadosDaPlanilha) {
  const ws = wb.addWorksheet("Parâmetros");
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 68;

  ws.mergeCells("A1:B1");
  const t = ws.getCell("A1");
  t.value = "Relatório de cobrança — Cobratec";
  t.font = { bold: true, size: 14, color: { argb: COR_TEXTO_CABECALHO } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  const lista = (v: string[], vazio: string) => (v.length ? v.join(", ") : vazio);

  const linhas: [string, string][] = [
    ["Exportado por", ctx.exportadoPor],
    ["Exportado em", ctx.exportadoEm.toLocaleString("pt-BR")],
    ["", ""],
    ["Período (olha para trás)", `${isoParaBR(ctx.periodo.inicio)} a ${isoParaBR(ctx.periodo.fim)}`],
    ["  vale para", "acordos, acionamentos e comissão"],
    ["Janela (olha para frente)", `${isoParaBR(ctx.janela.inicio)} a ${isoParaBR(ctx.janela.fim)}`],
    ["  vale para", "a vencer e a lista nominal de parcelas"],
    ["", ""],
    ["Carteiras", lista(ctx.recorte.carteiras, "todas")],
    ["Equipes", lista(ctx.recorte.equipes, "todas")],
    ["Operadoras", lista(ctx.recorte.operadoras, "todas")],
    ["", ""],
    ["Abas geradas", ctx.abas.map((c) => abaDe(c)?.nome ?? c).join(", ")],
  ];

  let r = 3;
  for (const [rotulo, valor] of linhas) {
    if (rotulo === "" && valor === "") {
      r++;
      continue;
    }
    const a = ws.getCell(`A${r}`);
    a.value = rotulo;
    a.font = { bold: !rotulo.startsWith("  ") };
    a.alignment = { vertical: "top" };
    const b = ws.getCell(`B${r}`);
    b.value = valor;
    b.alignment = { vertical: "top", wrapText: true };
    a.border = BORDA_LEVE;
    b.border = BORDA_LEVE;
    r++;
  }

  // ─── As ressalvas ───
  //
  // Elas não são rodapé decorativo: cada uma corresponde a um erro de leitura
  // que já foi cometido ou é fácil de cometer. Vão na planilha porque ela sai do
  // app e é lida longe da tela que as explica.
  r += 1;
  ws.mergeCells(`A${r}:B${r}`);
  const th = ws.getCell(`A${r}`);
  th.value = "Como estes números são contados";
  th.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
  th.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  r++;

  const notas: string[] = [];
  if (dados.acordos) {
    notas.push(
      "Acordo é o acordo ATIVO (o quebrado sai da conta), pelo valor total negociado com juros e multa, " +
        "e pela data em que foi gravado. É creditado a quem teve a última ação manual com o devedor, " +
        "não a quem digitou. Conferido contra o relatório oficial do Siscobra.",
    );
  }
  if (dados.acionamentos) {
    notas.push(
      "Acionamento é só AÇÃO MANUAL — o retorno automático do discador fica de fora. " +
        "“Devedores” conta pessoas distintas, não ações. Conferido contra o relatório oficial.",
    );
  }
  if (dados.atraso || dados.parcelas) {
    notas.push(
      "“Em atraso” significa: a parcela venceu e NÃO encontramos a baixa correspondente. " +
        "Não é o mesmo que “o devedor não pagou” — não existe coluna de pagamento na parcela, " +
        "e a baixa é procurada por cruzamento. Confira a cobertura com `npm run db:validar-parcelas`.",
    );
  }
  if (dados.comissao) {
    notas.push(`COMISSÃO: ${dados.comissao.ressalva}`);
  }
  if (dados.parcelasTruncadas) {
    notas.push(
      "A lista nominal foi CORTADA no teto de linhas. Ela não representa a carteira inteira — " +
        "reduza a janela ou filtre por carteira para ver o conjunto completo.",
    );
  }
  notas.push(
    "Os dados são lidos do Siscobra em modo somente leitura, no instante da exportação. " +
      "Reexportar depois pode dar outro número, e isso é o esperado.",
  );

  for (const nota of notas) {
    ws.mergeCells(`A${r}:B${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = `• ${nota}`;
    c.alignment = { wrapText: true, vertical: "top" };
    c.border = BORDA_LEVE;
    ws.getRow(r).height = Math.max(30, Math.ceil(nota.length / 95) * 15);
    r++;
  }
}

/** Só o topo da lista — um gráfico com 353 operadoras não é um gráfico. */
function topN(fatias: Fatia[], n: number): [string, number][] {
  return [...fatias]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n)
    .map((f) => [f.rotulo, f.valor] as [string, number]);
}

function porChave(fatias: Fatia[]): [string, number][] {
  return fatias.map((f) => [f.rotulo, f.qtd] as [string, number]);
}

/**
 * O "Resumo" é o painel da planilha: cartões em cima, gráficos ao lado, e a
 * coluna de números à esquerda continuando a ser a fonte.
 *
 * Todos os blocos que viram gráfico ficam NESTA aba, e não numa referência às
 * abas de detalhe — as 17 abas são opcionais, e um gráfico apontando para uma
 * aba que o usuário não pediu abre o arquivo pedindo reparo. O painel tem que
 * funcionar sozinho, qualquer que seja o conjunto escolhido.
 */
function abaResumo(
  wb: ExcelJS.Workbook,
  ctx: Contexto,
  d: DadosDaPlanilha,
): PedidoGrafico[] {
  const ws = wb.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 2 }],
    // Ver a nota igual em `lib/excel.ts`: painel largo em retrato sai fatiado, e
    // o pedaço perdido são os gráficos.
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 2;
  for (let c = 4; c <= 19; c++) ws.getColumn(c).width = 9.5;

  faixaTitulo(
    ws,
    1,
    1,
    19,
    `Relatórios de cobrança — ${ctx.periodo.rotulo}`,
    `Janela de vencimento: ${ctx.janela.rotulo}`,
  );

  // ─── cartões ───
  const cartoes: [string, number, string, string?][] = [];
  if (d.acordos) {
    cartoes.push(["Acordos fechados", d.acordos.qtd, COR_BARRA.azul]);
    cartoes.push(["Valor acordado", d.acordos.valor, COR_BARRA.azul, FMT_MOEDA]);
    if (d.acordos.qtd > 0) {
      cartoes.push([
        "Ticket médio",
        d.acordos.valor / d.acordos.qtd,
        COR_BARRA.ciano,
        FMT_MOEDA,
      ]);
    }
  }
  if (d.acionamentos) {
    cartoes.push(["Acionamentos", d.acionamentos.qtd, COR_BARRA.violeta]);
  }
  if (d.aVencer) {
    cartoes.push(["A vencer (valor)", d.aVencer.valor, COR_BARRA.verde, FMT_MOEDA]);
    cartoes.push(["Vence hoje", d.aVencer.hoje.valor, COR_BARRA.ambar, FMT_MOEDA]);
  }
  if (d.atraso) {
    cartoes.push(["Em atraso (valor)", d.atraso.valor, COR_BARRA.vermelho, FMT_MOEDA]);
  }
  if (d.quebras) {
    cartoes.push(["Quebras (30 dias)", d.quebras.qtd, COR_BARRA.vermelho]);
  }
  if (d.primeira && d.primeira.avaliados > 0) {
    cartoes.push([
      "1ª parcela honrada",
      d.primeira.pagos / d.primeira.avaliados,
      COR_BARRA.verde,
      "0.0%",
    ]);
  }
  if (d.comissao) {
    cartoes.push(["Comissão apurada", d.comissao.valor, COR_BARRA.verde, FMT_MOEDA]);
  }
  cartoes.slice(0, 8).forEach(([rotulo, valor, cor, fmt], i) => {
    const linha = 3 + Math.floor(i / 4) * 4;
    const col = 4 + (i % 4) * 4;
    cartaoKpi(ws, linha, col, rotulo, valor, { cor, numFmt: fmt, largura: 4 });
  });

  // ─── blocos à esquerda (também são a fonte dos gráficos) ───
  const graficos: PedidoGrafico[] = [];
  let r = 3;
  const bloco = (
    titulo: string,
    dados: readonly LinhaIndicador[],
    cor: string,
    numFmt?: string,
  ) => {
    const b = adicionarBlocoIndicador(ws, r, titulo, dados, { cor, numFmt });
    r = b.proxima;
    return b;
  };
  const pedir = (
    b: { linhaIni: number; linhaFim: number; vazio: boolean },
    p: Omit<PedidoGrafico, "aba" | "categorias">,
  ) => {
    if (b.vazio) return;
    graficos.push({
      aba: "Resumo",
      categorias: { col: 1, linhaIni: b.linhaIni, linhaFim: b.linhaFim },
      ...p,
    });
  };

  // O terceiro elemento é o formato DAQUELA linha: o bloco mistura contagem e
  // dinheiro, e um formato único para o quadro faria o valor sair cru.
  if (d.acordos || d.acionamentos) {
    const kpis: LinhaIndicador[] = [];
    if (d.acordos) {
      kpis.push(["Acordos fechados", d.acordos.qtd, FMT_INTEIRO]);
      kpis.push(["Valor acordado", d.acordos.valor, FMT_MOEDA]);
      if (d.acordos.qtd > 0) {
        kpis.push(["Ticket médio", d.acordos.valor / d.acordos.qtd, FMT_MOEDA]);
      }
    }
    if (d.acionamentos) {
      kpis.push(["Acionamentos (ações manuais)", d.acionamentos.qtd, FMT_INTEIRO]);
      kpis.push(["Devedores distintos acionados", d.acionamentos.devedores, FMT_INTEIRO]);
    }
    bloco("Produção no período", kpis, COR_BARRA.azul);
  }

  if (d.aVencer || d.atraso || d.quebras || d.primeira) {
    const kpis: LinhaIndicador[] = [];
    if (d.aVencer) {
      kpis.push(["Parcelas a vencer na janela", d.aVencer.qtd, FMT_INTEIRO]);
      kpis.push(["Valor a vencer", d.aVencer.valor, FMT_MOEDA]);
      kpis.push(["Vence hoje (valor)", d.aVencer.hoje.valor, FMT_MOEDA]);
    }
    if (d.atraso) {
      kpis.push(["Parcelas em atraso", d.atraso.qtd, FMT_INTEIRO]);
      kpis.push(["Valor em atraso", d.atraso.valor, FMT_MOEDA]);
    }
    if (d.quebras) {
      kpis.push(["Acordos quebrados (30 dias)", d.quebras.qtd, FMT_INTEIRO]);
      kpis.push(["Valor quebrado", d.quebras.valor, FMT_MOEDA]);
    }
    if (d.primeira) {
      kpis.push(["1ª parcela avaliada", d.primeira.avaliados, FMT_INTEIRO]);
      kpis.push(["1ª parcela honrada", d.primeira.pagos, FMT_INTEIRO]);
    }
    bloco("Carteira de acordos", kpis, COR_BARRA.ciano);
  }

  if (d.comissao) {
    bloco(
      "Comissão apurada (não conferida — ver Parâmetros)",
      [
        ["Itens de comissão", d.comissao.qtd, FMT_INTEIRO],
        ["Comissão total", d.comissao.valor, FMT_MOEDA],
        ["Recebido nas parcelas correspondentes", d.comissao.recebido, FMT_MOEDA],
      ],
      COR_BARRA.verde,
    );
  }

  // ─── os blocos que existem PARA virar gráfico ───
  //
  // A hora do dia é a pergunta que a decisão 35 nomeou ("quantos acordos hoje,
  // hora a hora") e é a que menos se lê numa lista: 24 linhas de número contra
  // uma curva com um pico visível.
  let linhaGrafico = 12;
  const proximaAncora = () => {
    const pos = linhaGrafico;
    linhaGrafico += 17;
    return pos;
  };

  if (d.acordos?.porHora.length) {
    const b = bloco("Acordos por hora do dia", porChave(d.acordos.porHora), COR_BARRA.azul);
    pedir(b, {
      tipo: "coluna",
      titulo: "Acordos por hora do dia",
      series: [{ nome: "Acordos", col: 2, cor: "2563EB" }],
      ancora: { col: 4, linha: proximaAncora(), largura: 16, altura: 16 },
      legenda: "none",
      rotulos: true,
    });
  }
  if (d.acordos?.porOperadora.length) {
    const b = bloco(
      "Valor acordado — 12 maiores operadoras",
      topN(d.acordos.porOperadora, 12),
      COR_BARRA.azul,
      FMT_MOEDA,
    );
    const pos = proximaAncora();
    pedir(b, {
      tipo: "barra",
      titulo: "Valor acordado por operadora (top 12)",
      series: [{ nome: "Valor", col: 2, cor: "0EA5E9" }],
      ancora: { col: 4, linha: pos, largura: 8, altura: 16 },
      legenda: "none",
      formato: "R$ #,##0",
    });
    if (d.acordos.porCarteira.length) {
      const bc = bloco(
        "Valor acordado — 10 maiores carteiras",
        topN(d.acordos.porCarteira, 10),
        COR_BARRA.violeta,
        FMT_MOEDA,
      );
      pedir(bc, {
        tipo: "rosca",
        titulo: "Participação por carteira (top 10)",
        series: [{ nome: "Valor", col: 2 }],
        ancora: { col: 12, linha: pos, largura: 8, altura: 16 },
        legenda: "r",
      });
    }
  }
  if (d.atraso?.porFaixa.length) {
    const b = bloco(
      "Em atraso por faixa (aging)",
      d.atraso.porFaixa.map((f) => [f.rotulo, f.valor] as [string, number]),
      COR_BARRA.vermelho,
      FMT_MOEDA,
    );
    pedir(b, {
      tipo: "coluna",
      titulo: "Valor em atraso por faixa de dias",
      series: [{ nome: "Em atraso", col: 2, cor: "DC2626" }],
      ancora: { col: 4, linha: proximaAncora(), largura: 8, altura: 16 },
      legenda: "none",
      formato: "R$ #,##0",
    });
  }
  if (d.aVencer?.porDia.length) {
    const b = bloco(
      "A vencer por dia",
      d.aVencer.porDia.map((f) => [f.rotulo, f.valor] as [string, number]),
      COR_BARRA.verde,
      FMT_MOEDA,
    );
    pedir(b, {
      tipo: "linha",
      titulo: "Agenda de vencimento (valor por dia)",
      series: [{ nome: "A vencer", col: 2, cor: "059669" }],
      ancora: { col: 12, linha: linhaGrafico - 17, largura: 8, altura: 16 },
      legenda: "none",
      formato: "R$ #,##0",
    });
  }
  if (d.comissao?.porOperadora.length) {
    const b = bloco(
      "Comissão — 12 maiores operadoras",
      topN(d.comissao.porOperadora, 12),
      COR_BARRA.verde,
      FMT_MOEDA,
    );
    pedir(b, {
      tipo: "barra",
      titulo: "Comissão por operadora (top 12) — não conferida",
      series: [{ nome: "Comissão", col: 2, cor: "10B981" }],
      ancora: { col: 4, linha: proximaAncora(), largura: 8, altura: 16 },
      legenda: "none",
      formato: "R$ #,##0",
    });
  }

  // O rótulo do recorte, por extenso, também aqui: quem abre a planilha no
  // Resumo não passa pela aba Parâmetros antes de tirar conclusão.
  ws.getCell(`A${r}`).value = "Recorte";
  ws.getCell(`A${r}`).font = { bold: true };
  const partes = [
    ctx.recorte.carteiras.length ? `${ctx.recorte.carteiras.length} carteira(s)` : null,
    ctx.recorte.equipes.length ? `${ctx.recorte.equipes.length} equipe(s)` : null,
    ctx.recorte.operadoras.length
      ? `${ctx.recorte.operadoras.length} operadora(s)`
      : null,
  ].filter(Boolean);
  ws.getCell(`B${r}`).value = partes.length ? partes.join(" · ") : "sem filtro (tudo)";

  return graficos;
}

/**
 * O par de abas interativas: "Dados" (a tabela) e "Painel interativo".
 *
 * ─────────────────────────── por que existe ───────────────────────────
 *
 * As outras dezesseis abas são fotografias: o recorte foi decidido na tela, e a
 * planilha registra o resultado. Esta é a resposta para "e se eu quisesse ver só
 * a FESTCARD?" sem voltar ao site e exportar de novo — o recorte passa a ser
 * feito DENTRO do arquivo, por quem o recebeu.
 *
 * ───────────────────── o que faz os números responderem ─────────────────────
 *
 * Não é o slicer. O slicer só ESCONDE linhas da tabela; quem reage a linha
 * escondida é a fórmula:
 *
 *   • `SUBTOTAL(109; ...)` soma ignorando o que o filtro escondeu. É o que faz
 *     os cartões de KPI andarem sozinhos. (`109` é "soma, pulando oculto".)
 *   • O resumo por operadora precisa de mais: somar por CRITÉRIO **e** respeitar
 *     o filtro ao mesmo tempo. `SOMASE` ignora o filtro; `SUBTOTAL` não aceita
 *     critério. A combinação que resolve é o `SUBTOTAL` aplicado linha a linha
 *     via `OFFSET`, multiplicado pelo critério dentro de um `SUMPRODUCT`.
 *     É feio e é o idioma padrão da planilha para este problema.
 *
 * O par é cruzado de propósito: o slicer de CARTEIRA reordena o resumo por
 * OPERADORA, e vice-versa. Slicer e resumo no mesmo eixo deixariam uma barra só
 * na tela — nenhuma informação.
 *
 * ─────────────────────────── e se o slicer falhar ───────────────────────────
 *
 * A tabela sai com `filterButton: true`, então os menus de filtro do cabeçalho
 * continuam lá. Perdendo os botões, perde-se a beleza: as fórmulas, os cartões e
 * os gráficos continuam respondendo pelo filtro comum. Ver o cabeçalho de
 * `lib/excel-slicers.ts` — a parte do slicer é a única que não pôde ser
 * conferida nesta máquina, e por isso não pode ser a que sustenta a interação.
 */
function abasInterativas(
  wb: ExcelJS.Workbook,
  d: DadosDaPlanilha,
): { graficos: PedidoGrafico[]; slicers: PedidoSlicer[] } {
  const celulas = d.acordos?.matriz.celulas ?? [];
  if (!celulas.length) return { graficos: [], slicers: [] };

  // ─── aba "Dados": a tabela que os filtros mordem ───
  const dados = wb.addWorksheet("Dados", { views: [{ state: "frozen", ySplit: 1 }] });
  dados.getColumn(1).width = 30;
  dados.getColumn(2).width = 34;
  dados.getColumn(3).width = 12;
  dados.getColumn(4).width = 18;
  dados.addTable({
    name: "Acordos",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    // `filterButton: true` NÃO é enfeite: sem ele o exceljs escreve
    // `hiddenButton="1"` em toda coluna e a tabela fica sem menu de filtro —
    // aí, se o slicer não pegar, não sobra interatividade nenhuma.
    columns: [
      { name: "Operadora", filterButton: true },
      { name: "Carteira", filterButton: true },
      { name: "Acordos", filterButton: true },
      { name: "Valor", filterButton: true },
    ],
    rows: celulas.map((c) => [c.operadoraNome, c.carteiraNome, c.qtd, c.valor]),
  });
  const ultima = celulas.length + 1; // +1 do cabeçalho
  for (let r = 2; r <= ultima; r++) {
    dados.getCell(r, 3).numFmt = FMT_INTEIRO;
    dados.getCell(r, 4).numFmt = FMT_MOEDA;
  }

  // ─── aba "Painel interativo" ───
  const ws = wb.addWorksheet("Painel interativo", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.getColumn(1).width = 17;
  ws.getColumn(2).width = 17; // A:B ficam sob os slicers — e por isso vazias
  ws.getColumn(3).width = 2;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 2;
  for (let c = 7; c <= 22; c++) ws.getColumn(c).width = 9.5;

  faixaTitulo(
    ws,
    1,
    1,
    22,
    "Painel interativo",
    "Use os filtros à esquerda — os números e os gráficos acompanham",
  );

  const T = (col: string) => `Acordos[${col}]`;
  const cartoesFormula: [string, string, string, string?][] = [
    ["Acordos no recorte", `SUBTOTAL(109,${T("Acordos")})`, COR_BARRA.azul, FMT_INTEIRO],
    ["Valor no recorte", `SUBTOTAL(109,${T("Valor")})`, COR_BARRA.verde, FMT_MOEDA],
    [
      "Ticket médio",
      `IFERROR(SUBTOTAL(109,${T("Valor")})/SUBTOTAL(109,${T("Acordos")}),0)`,
      COR_BARRA.ciano,
      FMT_MOEDA,
    ],
  ];
  cartoesFormula.forEach(([rotulo, formula, cor, fmt], i) => {
    const col = 7 + i * 4;
    cartaoKpi(ws, 3, col, rotulo, 0, { cor, numFmt: fmt, largura: 4 });
    // O cartão grava um número; aqui ele vira fórmula, que é o que anda sozinho.
    ws.getCell(4, col).value = { formula, date1904: false };
  });

  // ─── os dois resumos, cruzados com os slicers ───
  const soma = (campo: "operadora" | "carteira", linhaRotulo: number) => {
    const colCriterio = campo === "operadora" ? "A" : "B";
    return (
      `SUMPRODUCT(SUBTOTAL(109,OFFSET(Dados!$D$2,ROW(Dados!$D$2:$D$${ultima})` +
      `-ROW(Dados!$D$2),0)),--(Dados!$${colCriterio}$2:$${colCriterio}$${ultima}` +
      `=$D$${linhaRotulo}))`
    );
  };

  const totalPor = (chave: "operadoraNome" | "carteiraNome") => {
    const m = new Map<string, number>();
    for (const c of celulas) m.set(c[chave], (m.get(c[chave]) ?? 0) + c.valor);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  };

  const bloco = (
    linhaInicio: number,
    titulo: string,
    itens: [string, number][],
    campo: "operadora" | "carteira",
    cor: string,
  ) => {
    ws.mergeCells(linhaInicio, 4, linhaInicio, 5);
    const t = ws.getCell(linhaInicio, 4);
    t.value = titulo;
    t.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
    t.alignment = { vertical: "middle" };

    itens.forEach(([nome], i) => {
      const r = linhaInicio + 1 + i;
      const a = ws.getCell(r, 4);
      a.value = nome;
      a.border = BORDA_LEVE;
      const b = ws.getCell(r, 5);
      b.value = { formula: soma(campo, r), date1904: false };
      b.numFmt = FMT_MOEDA;
      b.border = BORDA_LEVE;
      b.alignment = { horizontal: "right" };
    });
    return { linhaIni: linhaInicio + 1, linhaFim: linhaInicio + itens.length };
  };

  const porOper = totalPor("operadoraNome");
  const porCart = totalPor("carteiraNome");
  const bOper = bloco(8, "Valor por operadora (segue os filtros)", porOper, "operadora", COR_BARRA.azul);
  const bCart = bloco(
    8 + porOper.length + 3,
    "Valor por carteira (segue os filtros)",
    porCart,
    "carteira",
    COR_BARRA.violeta,
  );

  const graficos: PedidoGrafico[] = [
    {
      aba: "Painel interativo",
      tipo: "barra",
      titulo: "Valor por operadora",
      categorias: { col: 4, linhaIni: bOper.linhaIni, linhaFim: bOper.linhaFim },
      series: [{ nome: "Valor", col: 5, cor: "2563EB" }],
      ancora: { col: 7, linha: 8, largura: 8, altura: 17 },
      legenda: "none",
      formato: "R$ #,##0",
    },
    {
      aba: "Painel interativo",
      tipo: "rosca",
      titulo: "Participação por carteira",
      categorias: { col: 4, linhaIni: bCart.linhaIni, linhaFim: bCart.linhaFim },
      series: [{ nome: "Valor", col: 5 }],
      ancora: { col: 15, linha: 8, largura: 8, altura: 17 },
      legenda: "r",
    },
  ];

  const slicers: PedidoSlicer[] = [
    {
      aba: "Painel interativo",
      tabela: "Acordos",
      coluna: "Operadora",
      ancora: { col: 1, linha: 3, largura: 2, altura: 18 },
    },
    {
      aba: "Painel interativo",
      tabela: "Acordos",
      coluna: "Carteira",
      ancora: { col: 1, linha: 22, largura: 2, altura: 18 },
    },
  ];

  return { graficos, slicers };
}

function abaMatriz(
  wb: ExcelJS.Workbook,
  nome: string,
  matriz: { celulas: { operadoraNome: string; carteiraNome: string; qtd: number; valor: number }[]; truncada: boolean },
  rotuloValor: string,
) {
  const ws = abaTabela(
    wb,
    nome,
    [
      { header: "Operadora", key: "operadora", width: 30 },
      { header: "Carteira", key: "carteira", width: 34 },
      { header: "Quantidade", key: "qtd", width: 14 },
      { header: rotuloValor, key: "valor", width: 18 },
    ],
    matriz.celulas.map((c) => ({
      operadora: c.operadoraNome,
      carteira: c.carteiraNome,
      qtd: c.qtd,
      valor: c.valor,
    })),
    { qtd: FMT_INTEIRO, valor: FMT_MOEDA },
  );
  // Mapa de calor na coluna de valor. Numa matriz a barra de dados engana: ela
  // compara cada linha com o máximo da coluna inteira, e o que se procura aqui é
  // onde está o quente em relação ao quadro todo — que é o que a escala de cor
  // mostra de relance, com 5.000 células.
  if (matriz.celulas.length) {
    aplicarEscalaCor(ws, `D2:D${matriz.celulas.length + 1}`);
  }
  if (matriz.truncada) {
    const r = ws.addRow({
      operadora: "⚠ O cruzamento passou do teto e foi cortado nas maiores células.",
    });
    r.font = { bold: true, color: { argb: COR_BARRA.ambar } };
  }
}

// ────────────────────────────── a montagem ──────────────────────────────

export async function gerarWorkbookRelatorios(
  ctx: Contexto,
  d: DadosDaPlanilha,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cobratec — Relatórios de cobrança";
  wb.created = ctx.exportadoEm;

  const quer = (c: AbaChave) => ctx.abas.includes(c);
  const dinheiro = { header: "Valor (R$)", fmt: FMT_MOEDA };

  // Parâmetros primeiro: é a capa, e é a aba que abre quando o arquivo abre.
  abaParametros(wb, ctx, d);
  const graficos = quer("resumo") ? abaResumo(wb, ctx, d) : [];

  if (quer("acordos-operadora") && d.acordos) {
    abaFatias(wb, "Acordos · operadora", "Operadora", d.acordos.porOperadora, dinheiro);
  }
  if (quer("acordos-carteira") && d.acordos) {
    abaFatias(wb, "Acordos · carteira", "Carteira", d.acordos.porCarteira, dinheiro);
  }
  if (quer("acordos-matriz") && d.acordos) {
    abaMatriz(wb, "Acordos · oper x carteira", d.acordos.matriz, "Valor (R$)");
  }
  const interativo = quer("painel-interativo") && d.acordos
    ? abasInterativas(wb, d)
    : { graficos: [], slicers: [] };
  if (quer("acordos-mes") && d.acordos) {
    abaFatias(wb, "Acordos · mês", "Mês", d.acordos.porMes, dinheiro);
  }
  if (quer("acordos-hora") && d.acordos) {
    abaFatias(wb, "Acordos · hora", "Hora", d.acordos.porHora, dinheiro);
  }

  if (quer("acionamentos-operadora") && d.acionamentos) {
    abaFatias(wb, "Acionamentos · operadora", "Operadora", d.acionamentos.porOperadora, {
      header: "Devedores distintos",
      fmt: FMT_INTEIRO,
    });
  }
  if (quer("acionamentos-situacao") && d.acionamentos) {
    abaFatias(wb, "Acionamentos · situação", "Situação", d.acionamentos.porSituacao, {
      header: "Devedores distintos",
      fmt: FMT_INTEIRO,
    });
  }

  if (quer("comissao") && d.comissao) {
    abaFatias(wb, "Comissão · operadora", "Operadora", d.comissao.porOperadora, {
      header: "Comissão (R$)",
      fmt: FMT_MOEDA,
    });
  }
  if (quer("comissao-matriz") && d.comissao) {
    abaMatriz(wb, "Comissão · oper x carteira", d.comissao.matriz, "Comissão (R$)");
  }

  if (quer("carteira-a-vencer") && d.aVencer) {
    abaFatias(wb, "Carteira · a vencer", "Dia", d.aVencer.porDia, dinheiro);
  }
  if (quer("carteira-atraso") && d.atraso) {
    abaFatias(wb, "Carteira · em atraso", "Faixa de atraso", d.atraso.porFaixa, dinheiro);
  }
  if (quer("carteira-quebras") && d.quebras) {
    abaFatias(wb, "Carteira · quebras", "Carteira", d.quebras.porCarteira, dinheiro);
  }
  if (quer("carteira-primeira") && d.primeira) {
    abaTabela(
      wb,
      "Carteira · 1a parcela",
      [
        { header: "Carteira", key: "carteira", width: 34 },
        { header: "Acordos avaliados", key: "qtd", width: 18 },
        { header: "1ª parcela honrada", key: "pagos", width: 18 },
      ],
      d.primeira.porCarteira.map((f) => ({
        carteira: f.rotulo,
        qtd: f.qtd,
        pagos: f.valor, // `valor` carrega a contagem de honradas — ver o módulo
      })),
      { qtd: FMT_INTEIRO, pagos: FMT_INTEIRO },
    );
  }

  if (quer("carteira-operadora")) {
    const linhas: Record<string, unknown>[] = [];
    for (const f of d.aVencer?.porOperadora ?? []) {
      linhas.push({ bloco: "A vencer", operadora: f.rotulo, qtd: f.qtd, valor: f.valor });
    }
    for (const f of d.atraso?.porOperadora ?? []) {
      linhas.push({ bloco: "Em atraso", operadora: f.rotulo, qtd: f.qtd, valor: f.valor });
    }
    for (const f of d.quebras?.porOperadora ?? []) {
      linhas.push({ bloco: "Quebras", operadora: f.rotulo, qtd: f.qtd, valor: f.valor });
    }
    abaTabela(
      wb,
      "Carteira · operadora",
      [
        { header: "Bloco", key: "bloco", width: 16 },
        { header: "Operadora", key: "operadora", width: 30 },
        { header: "Quantidade", key: "qtd", width: 14 },
        { header: "Valor (R$)", key: "valor", width: 18 },
      ],
      linhas,
      { qtd: FMT_INTEIRO, valor: FMT_MOEDA },
    );
  }

  if (quer("parcelas") && d.parcelas) {
    abaTabela(
      wb,
      "Parcelas (nominal)",
      [
        { header: "Devedor", key: "nome", width: 34 },
        { header: "CPF", key: "cpf", width: 16 },
        { header: "Carteira", key: "carteira", width: 28 },
        { header: "Operadora", key: "operadora", width: 26 },
        { header: "Acordo", key: "acocod", width: 12 },
        { header: "Parcela", key: "parcela", width: 9 },
        { header: "Valor (R$)", key: "valor", width: 14 },
        { header: "Vencimento", key: "vencimento", width: 13 },
        { header: "Dias (− = atrasado)", key: "dias", width: 18 },
      ],
      d.parcelas.map((p) => ({
        nome: p.nome,
        cpf: p.cpf,
        carteira: p.carteira,
        operadora: p.operadora ?? "",
        acocod: p.acocod,
        parcela: p.parcela,
        valor: p.valor,
        // A data vem do SQL como "AAAA-MM-DD"; vira texto BR e não `Date` para
        // não reabrir a questão de fuso num campo que já veio pronto do banco.
        vencimento: isoParaBR(p.vencimento),
        dias: p.dias,
      })),
      { valor: FMT_MOEDA },
    );
  }

  // Slicer DEPOIS do gráfico: os dois escrevem no mesmo desenho da aba, e só o
  // injetor de slicer sabe acrescentar a um desenho que já existe.
  const comOsGraficos = await comGraficos(await wb.xlsx.writeBuffer(), [
    ...graficos,
    ...interativo.graficos,
  ]);
  return comSlicers(comOsGraficos, interativo.slicers);
}

/**
 * O nome do arquivo.
 *
 * Carrega o período porque a planilha vai viver numa pasta com outras dez, e
 * "relatorio (3).xlsx" não diz de quando é nenhuma delas.
 */
export function nomeDoArquivo(ctx: Contexto): string {
  const mesmo = ctx.periodo.inicio === ctx.periodo.fim;
  const trecho = mesmo
    ? ctx.periodo.inicio
    : `${ctx.periodo.inicio}_a_${ctx.periodo.fim}`;
  return `cobranca-${trecho}.xlsx`;
}
