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
  estilizarCabecalho,
  formatarColuna,
  isoParaBR,
  ligarAutoFiltro,
} from "@/lib/excel-estilo";
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

/** Os indicadores de abertura, com barra de dados — o mesmo desenho do inventário. */
function abaResumo(wb: ExcelJS.Workbook, ctx: Contexto, d: DadosDaPlanilha) {
  const ws = wb.addWorksheet("Resumo");
  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 18;

  ws.mergeCells("A1:B1");
  const t = ws.getCell("A1");
  t.value = `Resumo — ${ctx.periodo.rotulo}`;
  t.font = { bold: true, size: 14, color: { argb: COR_TEXTO_CABECALHO } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  let r = 3;

  if (d.acordos || d.acionamentos) {
    const kpis: [string, number][] = [];
    if (d.acordos) {
      kpis.push(["Acordos fechados", d.acordos.qtd]);
      kpis.push(["Valor acordado", d.acordos.valor]);
      if (d.acordos.qtd > 0) {
        kpis.push(["Ticket médio", d.acordos.valor / d.acordos.qtd]);
      }
    }
    if (d.acionamentos) {
      kpis.push(["Acionamentos (ações manuais)", d.acionamentos.qtd]);
      kpis.push(["Devedores distintos acionados", d.acionamentos.devedores]);
    }
    r = adicionarBlocoIndicador(ws, r, "Produção no período", kpis, {
      cor: COR_BARRA.azul,
    });
  }

  if (d.aVencer || d.atraso || d.quebras || d.primeira) {
    const kpis: [string, number][] = [];
    if (d.aVencer) {
      kpis.push(["Parcelas a vencer na janela", d.aVencer.qtd]);
      kpis.push(["Valor a vencer", d.aVencer.valor]);
      kpis.push(["Vence hoje (valor)", d.aVencer.hoje.valor]);
    }
    if (d.atraso) {
      kpis.push(["Parcelas em atraso", d.atraso.qtd]);
      kpis.push(["Valor em atraso", d.atraso.valor]);
    }
    if (d.quebras) {
      kpis.push(["Acordos quebrados (30 dias)", d.quebras.qtd]);
      kpis.push(["Valor quebrado", d.quebras.valor]);
    }
    if (d.primeira) {
      kpis.push(["1ª parcela avaliada", d.primeira.avaliados]);
      kpis.push(["1ª parcela honrada", d.primeira.pagos]);
    }
    r = adicionarBlocoIndicador(ws, r, "Carteira de acordos", kpis, {
      cor: COR_BARRA.ciano,
    });
  }

  if (d.comissao) {
    r = adicionarBlocoIndicador(
      ws,
      r,
      "Comissão apurada (não conferida — ver Parâmetros)",
      [
        ["Itens de comissão", d.comissao.qtd],
        ["Comissão total", d.comissao.valor],
        ["Recebido nas parcelas correspondentes", d.comissao.recebido],
      ],
      { cor: COR_BARRA.verde },
    );
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
  if (matriz.truncada) {
    const r = ws.addRow({
      operadora: "⚠ O cruzamento passou do teto e foi cortado nas maiores células.",
    });
    r.font = { bold: true, color: { argb: COR_BARRA.ambar } };
  }
}

// ────────────────────────────── a montagem ──────────────────────────────

export function gerarWorkbookRelatorios(
  ctx: Contexto,
  d: DadosDaPlanilha,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cobratec — Relatórios de cobrança";
  wb.created = ctx.exportadoEm;

  const quer = (c: AbaChave) => ctx.abas.includes(c);
  const dinheiro = { header: "Valor (R$)", fmt: FMT_MOEDA };

  // Parâmetros primeiro: é a capa, e é a aba que abre quando o arquivo abre.
  abaParametros(wb, ctx, d);
  if (quer("resumo")) abaResumo(wb, ctx, d);

  if (quer("acordos-operadora") && d.acordos) {
    abaFatias(wb, "Acordos · operadora", "Operadora", d.acordos.porOperadora, dinheiro);
  }
  if (quer("acordos-carteira") && d.acordos) {
    abaFatias(wb, "Acordos · carteira", "Carteira", d.acordos.porCarteira, dinheiro);
  }
  if (quer("acordos-matriz") && d.acordos) {
    abaMatriz(wb, "Acordos · oper x carteira", d.acordos.matriz, "Valor (R$)");
  }
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

  return wb.xlsx.writeBuffer();
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
