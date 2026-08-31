import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { comGraficos, type PedidoGrafico } from "@/lib/excel-graficos";

// O que estes testes protegem: gráfico é XML escrito à mão, e XML de gráfico
// errado NÃO faz o Excel ignorar o gráfico — faz ele abrir a caixa "conteúdo
// ilegível". A planilha inteira fica sob suspeita por causa de um retângulo.
//
// Por isso as asserções são estruturais (as partes existem, estão declaradas no
// [Content_Types], os .rels amarram, a ordem dos elementos da aba é a do
// schema) e não "parece bonito". A conferência visual foi feita abrindo o
// arquivo no LibreOffice durante o desenvolvimento; o que dá para automatizar
// sem instalar um pacote de escritório no CI é isto aqui.

async function planilhaBase(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Painel");
  ws.getCell("A1").value = "Categoria";
  ws.getCell("B1").value = "Qtd";
  [
    ["Ana", 10],
    ["Bruno", 20],
    ["Carla", 30],
  ].forEach((l, i) => {
    ws.getCell(i + 2, 1).value = l[0] as string;
    ws.getCell(i + 2, 2).value = l[1] as number;
  });
  return wb;
}

const PEDIDO: PedidoGrafico = {
  aba: "Painel",
  tipo: "coluna",
  titulo: "Por pessoa",
  categorias: { col: 1, linhaIni: 2, linhaFim: 4 },
  series: [{ nome: "Qtd", col: 2, cor: "2563EB" }],
  ancora: { col: 4, linha: 2, largura: 8, altura: 15 },
};

async function gerar(pedidos: PedidoGrafico[], wb?: ExcelJS.Workbook) {
  const livro = wb ?? (await planilhaBase());
  const buf = await comGraficos(await livro.xlsx.writeBuffer(), pedidos);
  return JSZip.loadAsync(buf);
}

describe("comGraficos", () => {
  it("acrescenta as partes do gráfico e as declara no [Content_Types]", async () => {
    const zip = await gerar([PEDIDO]);

    expect(zip.file("xl/charts/chart1.xml")).not.toBeNull();
    expect(zip.file("xl/drawings/drawing1.xml")).not.toBeNull();
    expect(zip.file("xl/drawings/_rels/drawing1.xml.rels")).not.toBeNull();

    const ct = await zip.file("[Content_Types].xml")!.async("string");
    // Parte não declarada no Content_Types é exatamente o caso em que o Excel
    // acusa arquivo corrompido em vez de só ignorar o gráfico.
    expect(ct).toContain("/xl/charts/chart1.xml");
    expect(ct).toContain("drawingml.chart+xml");
    expect(ct).toContain("/xl/drawings/drawing1.xml");
  });

  it("aponta para o intervalo pedido, com o nome da aba entre aspas", async () => {
    const zip = await gerar([PEDIDO]);
    const chart = await zip.file("xl/charts/chart1.xml")!.async("string");
    expect(chart).toContain("'Painel'!$A$2:$A$4");
    expect(chart).toContain("'Painel'!$B$2:$B$4");
    expect(chart).toContain("<c:barDir val=\"col\"/>");
    expect(chart).toContain("2563EB");
  });

  it("amarra a aba ao desenho pelo .rels e pelo elemento <drawing>", async () => {
    const zip = await gerar([PEDIDO]);
    const rels = await zip
      .file("xl/worksheets/_rels/sheet1.xml.rels")!
      .async("string");
    const idDesenho = /Id="(rId\d+)"[^>]*drawings\/drawing1\.xml/.exec(rels)?.[1];
    expect(idDesenho).toBeTruthy();

    const aba = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(aba).toContain(`<drawing r:id="${idDesenho}"/>`);
  });

  it("põe o <drawing> ANTES de <tableParts> quando a aba tem tabela", async () => {
    // O schema exige essa ordem. Enfiar sempre antes de </worksheet> funciona
    // até a aba ganhar uma tabela — e aí o arquivo abre pedindo reparo, sem
    // nenhuma outra pista do motivo.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Painel");
    ws.addTable({
      name: "T1",
      ref: "A1",
      headerRow: true,
      columns: [{ name: "Categoria" }, { name: "Qtd" }],
      rows: [["Ana", 10], ["Bruno", 20], ["Carla", 30]],
    });

    const zip = await gerar([PEDIDO], wb);
    const aba = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(aba).toContain("<tableParts");
    expect(aba.indexOf("<drawing")).toBeLessThan(aba.indexOf("<tableParts"));
  });

  it("junta vários gráficos da mesma aba num desenho só", async () => {
    const zip = await gerar([PEDIDO, { ...PEDIDO, titulo: "Outro", tipo: "rosca" }]);
    expect(zip.file("xl/charts/chart1.xml")).not.toBeNull();
    expect(zip.file("xl/charts/chart2.xml")).not.toBeNull();
    expect(zip.file("xl/drawings/drawing2.xml")).toBeNull();

    const desenho = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    expect(desenho.match(/<xdr:twoCellAnchor/g)).toHaveLength(2);
  });

  it("colore fatia a fatia na rosca, e a série inteira na coluna", async () => {
    const zip = await gerar([{ ...PEDIDO, tipo: "rosca", cores: undefined }]);
    const chart = await zip.file("xl/charts/chart1.xml")!.async("string");
    // Três categorias, três <c:dPt> — sem isso a rosca sai monocromática.
    expect(chart.match(/<c:dPt>/g)).toHaveLength(3);
    expect(chart).toContain("doughnutChart");
  });

  it("estoura quando a aba do pedido não existe", async () => {
    // Aba renomeada é o erro que passaria despercebido até alguém abrir o
    // arquivo e não achar o gráfico — melhor falhar na geração.
    await expect(gerar([{ ...PEDIDO, aba: "Não existe" }])).rejects.toThrow(
      /não existe na planilha/,
    );
  });

  it("devolve o arquivo intacto quando não há gráfico nenhum", async () => {
    const wb = await planilhaBase();
    const original = await wb.xlsx.writeBuffer();
    const saida = await comGraficos(original, []);
    expect(saida.length).toBe(Buffer.from(original as ArrayBuffer).length);
  });

  it("escapa o que vai para dentro do XML", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A & B");
    const zip = await gerar(
      [{ ...PEDIDO, aba: "A & B", titulo: 'Acordos "fechados" & <hoje>' }],
      wb,
    );
    const chart = await zip.file("xl/charts/chart1.xml")!.async("string");
    expect(chart).toContain("&amp;");
    expect(chart).not.toMatch(/<a:t>[^<]*<hoje>/);
    // Duas coisas de uma vez: o mapa de abas DESESCAPA o nome vindo do
    // workbook.xml para casar com o "A & B" que o chamador passou (senão o
    // pedido seria recusado como aba inexistente), e a fórmula sai REESCAPADA,
    // porque `&` cru dentro do XML é justamente o arquivo corrompido.
    expect(chart).toContain("'A &amp; B'!$A$2:$A$4");
  });
});
