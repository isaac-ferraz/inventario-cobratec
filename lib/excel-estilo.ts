// As peças de estilo do Excel, compartilhadas pelas duas planilhas.
//
// Existem duas: a do INVENTÁRIO (`lib/excel.ts`, desde o começo do projeto) e a
// dos RELATÓRIOS do CRM (`lib/excel-relatorios.ts`, decisão 39). Elas geram
// coisas diferentes e devem parecer a mesma planilha — mesmo cabeçalho escuro,
// mesma borda leve, mesma barra de dados. Copiar os helpers para o módulo novo
// garantiria que uma das duas ficasse para trás na próxima mudança.
//
// ─────────────── dois defeitos antigos consertados de passagem ───────────────
//
// Ao extrair, dois problemas do gerador original ficaram visíveis e saíram
// junto, porque nenhum dos dois é opinião:
//
//   1. NÚMERO SEM FORMATO. `valorCompra` e `custo` eram gravados crus. No Excel
//      apareciam como "3450.9" — a planilha de um sistema em português com
//      ponto decimal e sem R$.
//   2. DATA COMO TEXTO. `toLocaleDateString("pt-BR")` produz a string
//      "13/08/2026", e o Excel a trata como texto: a coluna NÃO ordena por
//      data (13/08 vem antes de 02/09, por ordem alfabética) e o filtro de
//      data não aparece. Agora vai `Date` com `numFmt`, que exibe igual e
//      ordena certo.
//
// E um recurso que faltava: `autoFilter` no cabeçalho. Quem recebe a planilha
// quase sempre quer filtrar uma coluna, e ligar isso à mão em cada arquivo é o
// tipo de trabalho que o gerador existe para poupar.
import ExcelJS from "exceljs";

export const COR_CABECALHO = "FF1F2937"; // cinza-azulado escuro
export const COR_TEXTO_CABECALHO = "FFFFFFFF";

export const BORDA_LEVE: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

/** Real com duas casas e separador de milhar, no padrão brasileiro. */
export const FMT_MOEDA = 'R$ #,##0.00';
/** Data curta. A célula guarda um `Date`; isto é só como ela aparece. */
export const FMT_DATA = "dd/mm/yyyy";
/** Inteiro com separador de milhar — contagens grandes ficam ilegíveis sem ele. */
export const FMT_INTEIRO = "#,##0";

/** As cores das barras de dados, por assunto. */
export const COR_BARRA = {
  azul: "FF2563EB",
  violeta: "FF7C3AED",
  verde: "FF059669",
  vermelho: "FFDC2626",
  ambar: "FFD97706",
  ciano: "FF0891B2",
} as const;

/**
 * Data para célula de planilha.
 *
 * Devolve o próprio `Date` (com `numFmt` aplicado por quem escreve) ou `null`.
 * Não devolve string: ver a nota 2 do cabeçalho.
 */
export function dataCelula(d: Date | null | undefined): Date | null {
  return d ?? null;
}

/**
 * Data como TEXTO, para quando ela é rótulo e não dado.
 *
 * Um cabeçalho "Período: 01/08/2026 a 13/08/2026" é uma frase, não uma coluna
 * ordenável — aí o texto é o certo.
 */
export function dataBR(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("pt-BR") : "";
}

/** `"2026-08-13"` → `"13/08/2026"`, sem passar por `Date` (e sem fuso). */
export function isoParaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

export function estilizarCabecalho(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR_CABECALHO },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = BORDA_LEVE;
  });
  row.height = 20;
}

/**
 * Liga o filtro do Excel na linha de cabeçalho de uma aba tabular.
 *
 * Só faz sentido quando a aba é uma tabela de verdade, começando em A1 — por
 * isso não está dentro de `estilizarCabecalho`, que o Dashboard também usa em
 * blocos de indicador no meio da planilha.
 */
export function ligarAutoFiltro(ws: ExcelJS.Worksheet, colunas: number): void {
  if (colunas < 1) return;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: colunas },
  };
}

/**
 * Aplica o formato de uma coluna inteira, do cabeçalho para baixo.
 *
 * `ws.getColumn(k).numFmt` pegaria o cabeçalho junto — o texto não muda, mas a
 * célula passa a carregar um formato de moeda que atrapalha quem edita depois.
 */
export function formatarColuna(
  ws: ExcelJS.Worksheet,
  chave: string,
  numFmt: string,
): void {
  const col = ws.getColumn(chave);
  if (!col) return;
  col.eachCell({ includeEmpty: false }, (cell, linha) => {
    if (linha === 1) return; // o cabeçalho é texto
    cell.numFmt = numFmt;
  });
}

/**
 * Barra de dados na coluna de valores de um bloco de indicador.
 *
 * O cast existe porque a tipagem do `exceljs` para `DataBarRuleType` não
 * declara `color`, embora o escritor de XLSX o use. Trocar a lib por causa
 * disso seria caro; o cast está isolado aqui, em uma função.
 */
export function aplicarDataBar(
  ws: ExcelJS.Worksheet,
  primeiraLinha: number,
  qtde: number,
  corArgb: string,
  coluna = "B",
): void {
  if (qtde <= 0) return;
  const ref = `${coluna}${primeiraLinha}:${coluna}${primeiraLinha + qtde - 1}`;
  const regra = {
    type: "dataBar",
    cfvo: [{ type: "num", value: 0 }, { type: "max" }],
    color: { argb: corArgb },
    priority: 1,
  } as unknown as ExcelJS.DataBarRuleType;
  ws.addConditionalFormatting({ ref, rules: [regra] });
}

/**
 * Uma linha de bloco: rótulo, valor e — opcionalmente — o formato DELA.
 *
 * O formato por linha existe porque um bloco de KPI mistura naturezas: "Acordos
 * fechados 486" e "Valor acordado R$ 1.284.300,55" moram no mesmo quadro. Um
 * `numFmt` único para o bloco obriga a escolher qual das duas sai errada, e o
 * que saía era o dinheiro, cru: "1284300,55".
 */
export type LinhaIndicador = [string, number] | [string, number, string];

/** O que um bloco de indicador deixa para trás. */
export type BlocoIndicador = {
  /** Próxima linha livre, com a linha em branco de separação já contada. */
  proxima: number;
  /** Primeira linha COM DADOS. */
  linhaIni: number;
  /** Última linha COM DADOS. Igual a `linhaIni - 1` quando o bloco é vazio. */
  linhaFim: number;
  vazio: boolean;
};

/**
 * Um bloco "título + pares nome/valor" com barra de dados.
 *
 * Devolve a PRÓXIMA linha livre — e é por isso que ele existe: a versão
 * anterior obrigava quem chamava a fazer a aritmética (`r += 1 + dados.length +
 * 1`), e essa conta errava quando o bloco vinha vazio, porque o "(sem dados)"
 * ocupa uma linha que `dados.length` não conta. Blocos seguintes escreviam por
 * cima do anterior.
 *
 * Devolve TAMBÉM o intervalo que ocupou, porque o gráfico nativo aponta para
 * células por endereço (ver `lib/excel-graficos.ts`). Deixar quem chama refazer
 * a conta do intervalo repõe exatamente o erro que o `proxima` veio corrigir —
 * e um gráfico apontando para a faixa errada tem a mesma cara de um certo.
 */
export function adicionarBlocoIndicador(
  ws: ExcelJS.Worksheet,
  linhaInicio: number,
  titulo: string,
  dados: readonly LinhaIndicador[],
  opcoes: { cor?: string; numFmt?: string } = {},
): BlocoIndicador {
  ws.mergeCells(`A${linhaInicio}:B${linhaInicio}`);
  const t = ws.getCell(`A${linhaInicio}`);
  t.value = titulo;
  t.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  t.alignment = { vertical: "middle" };

  let linha = linhaInicio + 1;
  const primeiraDeDados = linha;

  for (const [nome, valor, fmt] of dados) {
    ws.getCell(`A${linha}`).value = nome;
    ws.getCell(`A${linha}`).border = BORDA_LEVE;
    const cv = ws.getCell(`B${linha}`);
    cv.value = valor;
    cv.alignment = { horizontal: "center" };
    cv.border = BORDA_LEVE;
    const numFmt = fmt ?? opcoes.numFmt;
    if (numFmt) cv.numFmt = numFmt;
    linha++;
  }

  if (dados.length === 0) {
    ws.getCell(`A${linha}`).value = "(sem dados)";
    ws.getCell(`A${linha}`).font = { italic: true, color: { argb: "FF6B7280" } };
    linha++;
  } else if (opcoes.cor) {
    aplicarDataBar(ws, primeiraDeDados, dados.length, opcoes.cor);
  }

  return {
    proxima: linha + 1, // uma linha em branco antes do próximo bloco
    linhaIni: primeiraDeDados,
    linhaFim: primeiraDeDados + dados.length - 1,
    vazio: dados.length === 0,
  };
}

// ───────────────────────── a camada de painel ─────────────────────────
//
// O que segue existe para o Dashboard PARECER um painel, e não uma lista de
// números com barrinhas. São três peças: a faixa de título, o cartão de KPI e a
// escala de cor. Nenhuma delas inventa dado — todas só vestem o que já estava
// escrito na célula.

/** Faixa escura de título, atravessando a largura do painel. */
export function faixaTitulo(
  ws: ExcelJS.Worksheet,
  linha: number,
  colIni: number,
  colFim: number,
  titulo: string,
  subtitulo?: string,
): void {
  ws.mergeCells(linha, colIni, linha, colFim);
  const c = ws.getCell(linha, colIni);
  c.value = subtitulo ? `${titulo}          ${subtitulo}` : titulo;
  c.font = { bold: true, size: 15, color: { argb: COR_TEXTO_CABECALHO } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(linha).height = 32;
}

/**
 * Cartão de KPI: rótulo pequeno em cima, número grande embaixo.
 *
 * Ocupa `largura` colunas e 3 linhas (rótulo, número, número). O número é
 * mesclado em duas linhas porque uma linha de altura padrão corta a fonte 20 —
 * e aumentar a altura da linha inteira estragaria o bloco ao lado.
 */
export function cartaoKpi(
  ws: ExcelJS.Worksheet,
  linha: number,
  col: number,
  rotulo: string,
  valor: number | string,
  opcoes: { cor?: string; numFmt?: string; largura?: number } = {},
): void {
  const largura = opcoes.largura ?? 3;
  const cor = opcoes.cor ?? COR_BARRA.azul;
  const colFim = col + largura - 1;

  ws.mergeCells(linha, col, linha, colFim);
  const r = ws.getCell(linha, col);
  r.value = rotulo.toUpperCase();
  r.font = { bold: true, size: 8, color: { argb: "FF6B7280" } };
  r.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  // A cor do assunto entra como um filete no topo, e não como fundo do cartão:
  // dez cartões de fundo colorido brigam entre si e o número some.
  r.border = { top: { style: "medium", color: { argb: cor } } };

  ws.mergeCells(linha + 1, col, linha + 2, colFim);
  const v = ws.getCell(linha + 1, col);
  v.value = valor;
  v.font = { bold: true, size: 20, color: { argb: cor } };
  v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  v.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  v.border = {
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
  if (opcoes.numFmt) v.numFmt = opcoes.numFmt;
}

/**
 * Escala de cor (mapa de calor) sobre um intervalo.
 *
 * Serve para matriz — operadora × carteira — onde a barra de dados não ajuda:
 * a barra compara dentro da coluna, e numa matriz o que interessa é onde está o
 * quente em relação ao resto do quadro inteiro.
 */
export function aplicarEscalaCor(
  ws: ExcelJS.Worksheet,
  ref: string,
  cores: [string, string, string] = ["FFFFFFFF", "FFBFDBFE", "FF2563EB"],
): void {
  const regra = {
    type: "colorScale",
    cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
    color: cores.map((argb) => ({ argb })),
    priority: 1,
  } as unknown as ExcelJS.ColorScaleRuleType;
  ws.addConditionalFormatting({ ref, rules: [regra] });
}
