import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { comGraficos, type PedidoGrafico } from "@/lib/excel-graficos";
import { comSlicers, nomeDeCache, type PedidoSlicer } from "@/lib/excel-slicers";

// Slicer é extensão da Microsoft, e o LibreOffice não a implementa — o que dá
// para conferir em máquina sem Excel é a ESTRUTURA (as cinco partes existem,
// estão declaradas, os .rels amarram, a ordem dos elementos é a do schema) e a
// DEGRADAÇÃO (o mc:Fallback, que é o que faz outro leitor pular os botões em vez
// de acusar arquivo corrompido). Está dito na decisão 41 que o teste que falta é
// abrir uma vez no Excel de verdade.

async function comTabela(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const dados = wb.addWorksheet("Dados");
  dados.addTable({
    name: "Acordos",
    ref: "A1",
    headerRow: true,
    columns: [
      { name: "Operadora", filterButton: true },
      { name: "Carteira", filterButton: true },
      { name: "Valor", filterButton: true },
    ],
    rows: [
      ["Ana", "FESTCARD", 100],
      ["Bruno", "COOPEREMB", 200],
    ],
  });
  wb.addWorksheet("Painel");
  return wb;
}

const PEDIDO: PedidoSlicer = {
  aba: "Painel",
  tabela: "Acordos",
  coluna: "Operadora",
  ancora: { col: 1, linha: 3, largura: 2, altura: 12 },
};

async function gerar(pedidos: PedidoSlicer[], wb?: ExcelJS.Workbook) {
  const livro = wb ?? (await comTabela());
  return JSZip.loadAsync(await comSlicers(await livro.xlsx.writeBuffer(), pedidos));
}

describe("comSlicers", () => {
  it("cria as partes de slicer e as declara no [Content_Types]", async () => {
    const zip = await gerar([PEDIDO]);
    expect(zip.file("xl/slicerCaches/slicerCache1.xml")).not.toBeNull();
    expect(zip.file("xl/slicers/slicer1.xml")).not.toBeNull();

    const ct = await zip.file("[Content_Types].xml")!.async("string");
    expect(ct).toContain("application/vnd.ms-excel.slicerCache+xml");
    expect(ct).toContain("application/vnd.ms-excel.slicer+xml");
  });

  it("amarra o cache na TABELA por id e por índice de coluna", async () => {
    // O cache não guarda o nome da coluna para localizar o dado: guarda o id da
    // tabela e o número da coluna. Apontar para a coluna errada dá um slicer que
    // filtra outra coisa, sem erro nenhum.
    const zip = await gerar([{ ...PEDIDO, coluna: "Carteira" }]);
    const cache = await zip.file("xl/slicerCaches/slicerCache1.xml")!.async("string");
    expect(cache).toContain('sourceName="Carteira"');
    expect(cache).toContain('<x15:tableSlicerCache tableId="1" column="2"/>');
  });

  it("liga o cache no WORKBOOK e o slicer na ABA", async () => {
    const zip = await gerar([PEDIDO]);

    const wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    const ridCache = /Id="(rId\d+)"[^>]*slicerCaches\/slicerCache1\.xml/.exec(wbRels)?.[1];
    expect(ridCache).toBeTruthy();
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain(`<x14:slicerCache r:id="${ridCache}"/>`);

    // "Painel" é a segunda aba do livro.
    const abaRels = await zip.file("xl/worksheets/_rels/sheet2.xml.rels")!.async("string");
    const ridSlicer = /Id="(rId\d+)"[^>]*slicers\/slicer1\.xml/.exec(abaRels)?.[1];
    expect(ridSlicer).toBeTruthy();
    const aba = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(aba).toContain(`<x14:slicer r:id="${ridSlicer}"/>`);
  });

  it("põe o extLst da aba por último, depois do drawing", async () => {
    // extLst é o último filho de <worksheet> no schema, e <drawing> vem antes.
    // Invertido, o arquivo abre pedindo reparo.
    const zip = await gerar([PEDIDO]);
    const aba = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(aba.indexOf("<drawing")).toBeGreaterThan(-1);
    expect(aba.indexOf("<drawing")).toBeLessThan(aba.indexOf("<extLst"));
    expect(aba.indexOf("<extLst")).toBeLessThan(aba.indexOf("</worksheet>"));
  });

  it("embrulha a âncora em mc:AlternateContent com Fallback", async () => {
    // É esta moldura que faz um leitor sem slicer (LibreOffice, visualizadores
    // web) pular o bloco em silêncio, em vez de reclamar do arquivo inteiro.
    // Sem ela, a degradação vira corrupção.
    const zip = await gerar([PEDIDO]);
    const nomes = Object.keys(zip.files).filter((n) => /drawings\/.*\.xml$/.test(n));
    const desenho = await zip.file(nomes[0])!.async("string");
    expect(desenho).toContain("<mc:AlternateContent");
    expect(desenho).toContain('Requires="sle"');
    expect(desenho).toContain("<mc:Fallback/>");
    expect(desenho).toContain('<sle:slicer');
  });

  it("acrescenta ao desenho que os GRÁFICOS já criaram, sem criar outro", async () => {
    // A ordem é comGraficos → comSlicers, e os dois escrevem na mesma aba. Se
    // este criasse um segundo drawing, a aba teria duas relações de desenho e
    // uma delas seria ignorada — provavelmente a dos gráficos.
    const wb = await comTabela();
    const painel = wb.getWorksheet("Painel")!;
    painel.getCell("D1").value = "Ana";
    painel.getCell("E1").value = 10;
    painel.getCell("D2").value = "Bruno";
    painel.getCell("E2").value = 20;

    const grafico: PedidoGrafico = {
      aba: "Painel",
      tipo: "coluna",
      titulo: "Teste",
      categorias: { col: 4, linhaIni: 1, linhaFim: 2 },
      series: [{ nome: "Valor", col: 5 }],
      ancora: { col: 7, linha: 3, largura: 6, altura: 12 },
    };
    const comCharts = await comGraficos(await wb.xlsx.writeBuffer(), [grafico]);
    const zip = await JSZip.loadAsync(await comSlicers(comCharts, [PEDIDO]));

    const desenhos = Object.keys(zip.files).filter((n) =>
      /^xl\/drawings\/drawing.*\.xml$/.test(n),
    );
    expect(desenhos).toHaveLength(1);

    const desenho = await zip.file(desenhos[0])!.async("string");
    expect(desenho).toContain("<mc:AlternateContent"); // o slicer
    expect(desenho).toContain("graphicFrame"); // e o gráfico, no mesmo arquivo

    const aba = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
    expect(aba.match(/<drawing r:id=/g)).toHaveLength(1);
  });

  it("recusa tabela, coluna ou aba que não existem", async () => {
    await expect(gerar([{ ...PEDIDO, tabela: "Fantasma" }])).rejects.toThrow(
      /tabela "Fantasma" não existe/,
    );
    await expect(gerar([{ ...PEDIDO, coluna: "Inexistente" }])).rejects.toThrow(
      /não tem a coluna "Inexistente"/,
    );
    await expect(gerar([{ ...PEDIDO, aba: "Sumida" }])).rejects.toThrow(
      /aba "Sumida" não existe/,
    );
  });

  it("devolve o arquivo intacto quando não há slicer nenhum", async () => {
    const wb = await comTabela();
    const original = await wb.xlsx.writeBuffer();
    const saida = await comSlicers(original, []);
    expect(saida.length).toBe(Buffer.from(original as ArrayBuffer).length);
  });

  it("limpa o nome do cache, que vira um nome definido do Excel", async () => {
    // Nome definido não aceita espaço nem acento — "Operadora do caso" cru
    // produziria um arquivo que não abre.
    expect(nomeDeCache("Operadora")).toBe("Slicer_Operadora");
    expect(nomeDeCache("Situação da ficha")).toBe("Slicer_Situacao_da_ficha");
    // "R" é alfanumérico e fica; some o espaço, os parênteses e o cifrão.
    expect(nomeDeCache("Valor (R$)")).toBe("Slicer_Valor__R__");
  });
});
