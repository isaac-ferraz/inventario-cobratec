// Gráficos NATIVOS do Excel numa planilha gerada pelo exceljs.
//
// A decisão 6 registrou que o `exceljs` não escreve gráfico, e isso continua
// verdade: em 4.4.0 não existe `worksheet.addChart` — só `addImage`. O que a
// decisão 6 não disse, porque na época não foi procurado, é que a limitação é da
// API e não do formato: um .xlsx é um zip de XML, o `jszip` já vem junto com o
// próprio exceljs, e um gráfico é um arquivo `xl/charts/chartN.xml` mais quatro
// costuras (drawing, dois .rels e o [Content_Types]).
//
// Então o caminho é: deixar o exceljs escrever o arquivo inteiro, reabrir o zip
// e ACRESCENTAR os gráficos. Nada do que o exceljs escreveu é reescrito — as
// células, os estilos e a formatação condicional saem dele, intactos.
//
// O preço, dito por inteiro:
//
//   • É OOXML na mão. XML malformado não faz o Excel ignorar o gráfico: faz ele
//     abrir a caixa "conteúdo ilegível, deseja recuperar?", que é PIOR que não
//     ter gráfico nenhum — a planilha inteira fica sob suspeita. Por isso o
//     teste (`lib/excel-graficos.test.ts`) não confere só o XML: ele abre o
//     arquivo no LibreOffice e falha se houver reparo.
//   • `jszip` era dependência TRANSITIVA do exceljs. Depender dela sem declarar
//     é apostar que o exceljs nunca troque de zipper; entrou no package.json.
//   • Os gráficos apontam para intervalos de células por endereço. Mexer nas
//     linhas de um bloco sem mexer no pedido do gráfico faz ele apontar para o
//     lugar errado — e um gráfico errado tem a mesma cara de um gráfico certo.
//     É por isso que quem monta o bloco devolve o intervalo que usou, em vez de
//     o gráfico recalcular a conta por fora.
import JSZip from "jszip";

/** Tipos que cobrem o que os dashboards pedem. */
export type TipoGrafico = "coluna" | "barra" | "pizza" | "rosca" | "linha" | "area";

export type SerieGrafico = {
  nome: string;
  /** Coluna (1-based) onde estão os valores desta série. */
  col: number;
  /** Cor ARGB sem alpha ("2563EB"). Só vale para série; pizza usa `cores`. */
  cor?: string;
};

export type PedidoGrafico = {
  /** Nome da aba onde o gráfico é ancorado E de onde saem os dados. */
  aba: string;
  tipo: TipoGrafico;
  titulo: string;
  /** Intervalo das categorias (rótulos), 1-based e inclusivo. */
  categorias: { col: number; linhaIni: number; linhaFim: number };
  series: SerieGrafico[];
  /** Canto superior esquerdo (1-based) e tamanho em células. */
  ancora: { col: number; linha: number; largura: number; altura: number };
  /** Cores por fatia — pizza/rosca. */
  cores?: string[];
  legenda?: "b" | "r" | "t" | "none";
  /** Mostrar o valor em cima de cada ponto. */
  rotulos?: boolean;
  /** Formato numérico dos rótulos/eixo, ex.: 'R$ #,##0'. */
  formato?: string;
};

// Paleta única dos gráficos. Sai daqui e não de cada chamada, senão duas abas
// da mesma planilha usam azuis diferentes para a mesma coisa.
export const PALETA = [
  "2563EB", "0EA5E9", "10B981", "F59E0B", "EF4444",
  "8B5CF6", "EC4899", "14B8A6", "F97316", "6366F1",
  "84CC16", "06B6D4", "A855F7", "DC2626", "0891B2",
];

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Nome de aba dentro de fórmula: aspas simples dobradas, como o Excel espera. */
function refAba(aba: string): string {
  return `'${aba.replace(/'/g, "''")}'`;
}

function colLetra(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function faixa(aba: string, col: number, ini: number, fim: number): string {
  const c = colLetra(col);
  return `${refAba(aba)}!$${c}$${ini}:$${c}$${fim}`;
}

function celula(aba: string, col: number, linha: number): string {
  return `${refAba(aba)}!$${colLetra(col)}$${linha}`;
}

// ─────────────────────────── pedaços do chart XML ───────────────────────────

function txtCorpo(texto: string, tamanho = 1200, negrito = 0): string {
  return (
    `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr>` +
    `<a:defRPr sz="${tamanho}" b="${negrito}"><a:solidFill>` +
    `<a:srgbClr val="374151"/></a:solidFill></a:defRPr></a:pPr>` +
    `<a:r><a:rPr lang="pt-BR" sz="${tamanho}" b="${negrito}"/>` +
    `<a:t>${esc(texto)}</a:t></a:r></a:p></c:rich></c:tx>`
  );
}

/**
 * A cor de uma série.
 *
 * Barra e fatia se pintam por DENTRO (`a:solidFill`), com a borda desligada.
 * Linha não tem dentro: a cor dela é o traço (`a:ln`) — e pintar o miolo
 * desligando a borda, que é o certo para a barra, deixa a linha INVISÍVEL,
 * sobrando só os marcadores soltos no gráfico. Custou um render para descobrir.
 */
function preenchimento(cor: string, traco = false): string {
  if (traco) {
    return (
      `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${cor}"/>` +
      `</a:solidFill><a:round/></a:ln><a:effectLst/></c:spPr>`
    );
  }
  return `<c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln></c:spPr>`;
}

function rotulosXml(mostrar: boolean, formato?: string): string {
  if (!mostrar) return "";
  return (
    `<c:dLbls>` +
    (formato ? `<c:numFmt formatCode="${esc(formato)}" sourceLinked="0"/>` : "") +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr>` +
    `<a:endParaRPr lang="pt-BR"/></a:p></c:txPr>` +
    `<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>` +
    `<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>` +
    `</c:dLbls>`
  );
}

function serieXml(p: PedidoGrafico, s: SerieGrafico, i: number, ehFatia: boolean): string {
  const { aba, categorias: cat } = p;
  // O nome da série é literal (c:v) e não uma referência a célula: o rótulo do
  // bloco nem sempre está numa célula sozinha, e apontar para a errada faz a
  // legenda mentir sem dar erro.
  const nome = `<c:tx><c:strRef><c:f>${esc(celula(aba, s.col, cat.linhaIni - 1))}</c:f>` +
    `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.nome)}</c:v></c:pt>` +
    `</c:strCache></c:strRef></c:tx>`;

  let cores = "";
  if (ehFatia) {
    // Pizza colore PONTO a ponto (c:dPt); série inteira de uma cor só viraria
    // um círculo monocromático.
    const n = cat.linhaFim - cat.linhaIni + 1;
    const paleta = p.cores?.length ? p.cores : PALETA;
    for (let k = 0; k < n; k++) {
      cores +=
        `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/>` +
        preenchimento(paleta[k % paleta.length]) +
        `</c:dPt>`;
    }
  } else if (s.cor) {
    cores = preenchimento(s.cor, p.tipo === "linha");
  }

  const catXml =
    `<c:cat><c:strRef><c:f>${esc(faixa(aba, cat.col, cat.linhaIni, cat.linhaFim))}</c:f>` +
    `</c:strRef></c:cat>`;
  const valXml =
    `<c:val><c:numRef><c:f>${esc(faixa(aba, s.col, cat.linhaIni, cat.linhaFim))}</c:f>` +
    `</c:numRef></c:val>`;

  const suave = p.tipo === "linha" ? `<c:smooth val="0"/>` : "";
  return (
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${nome}${cores}` +
    rotulosXml(!!p.rotulos, p.formato) +
    catXml + valXml + suave +
    `</c:ser>`
  );
}

function plotXml(p: PedidoGrafico, idEixoCat: number, idEixoVal: number): string {
  const ehFatia = p.tipo === "pizza" || p.tipo === "rosca";
  const series = p.series.map((s, i) => serieXml(p, s, i, ehFatia)).join("");
  const eixos = `<c:axId val="${idEixoCat}"/><c:axId val="${idEixoVal}"/>`;

  if (p.tipo === "pizza" || p.tipo === "rosca") {
    const buraco = p.tipo === "rosca" ? `<c:holeSize val="55"/>` : "";
    const tag = p.tipo === "rosca" ? "doughnutChart" : "pieChart";
    return (
      `<c:${tag}><c:varyColors val="1"/>${series}` +
      `<c:firstSliceAng val="0"/>${buraco}</c:${tag}>`
    );
  }
  if (p.tipo === "linha") {
    return (
      `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}` +
      `<c:marker val="1"/>${eixos}</c:lineChart>`
    );
  }
  if (p.tipo === "area") {
    return (
      `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}` +
      eixos + `</c:areaChart>`
    );
  }
  const dir = p.tipo === "barra" ? "bar" : "col";
  return (
    `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/>` +
    `<c:varyColors val="0"/>${series}<c:gapWidth val="60"/>` +
    `<c:overlap val="-15"/>${eixos}</c:barChart>`
  );
}

function eixosXml(p: PedidoGrafico, idCat: number, idVal: number): string {
  if (p.tipo === "pizza" || p.tipo === "rosca") return "";
  // Numa barra horizontal os papéis se invertem na tela, mas os eixos continuam
  // sendo "categoria" e "valor" — quem troca é só a posição.
  const posCat = p.tipo === "barra" ? "l" : "b";
  const posVal = p.tipo === "barra" ? "b" : "l";
  // Barra horizontal desenha de baixo para cima, então uma lista já ordenada em
  // ordem decrescente aparece de cabeça para baixo — o maior no rodapé. Inverter
  // o eixo põe o primeiro da lista no topo, que é onde o olho procura.
  const ordem = p.tipo === "barra" ? "maxMin" : "minMax";
  const linhaEixo =
    `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill>` +
    `</a:ln></c:spPr>`;
  const txtEixo =
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">` +
    `<a:solidFill><a:srgbClr val="6B7280"/></a:solidFill></a:defRPr></a:pPr>` +
    `<a:endParaRPr lang="pt-BR"/></a:p></c:txPr>`;
  return (
    `<c:catAx><c:axId val="${idCat}"/><c:scaling><c:orientation val="${ordem}"/>` +
    `</c:scaling><c:delete val="0"/><c:axPos val="${posCat}"/>${linhaEixo}${txtEixo}` +
    `<c:crossAx val="${idVal}"/></c:catAx>` +
    `<c:valAx><c:axId val="${idVal}"/><c:scaling><c:orientation val="minMax"/>` +
    `</c:scaling><c:delete val="0"/><c:axPos val="${posVal}"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill>` +
    `<a:srgbClr val="F3F4F6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    (p.formato ? `<c:numFmt formatCode="${esc(p.formato)}" sourceLinked="0"/>` : "") +
    linhaEixo + txtEixo +
    `<c:crossAx val="${idCat}"/></c:valAx>`
  );
}

function chartXml(p: PedidoGrafico, seq: number): string {
  // Os ids de eixo só precisam ser únicos DENTRO do gráfico; derivar da
  // sequência evita colisão se um dia dois plots dividirem o mesmo chartSpace.
  const idCat = 100_000_000 + seq * 2;
  const idVal = idCat + 1;
  const legenda =
    p.legenda === "none"
      ? `<c:plotVisOnly val="1"/>`
      : `<c:legend><c:legendPos val="${p.legenda ?? "b"}"/><c:overlay val="0"/>` +
        `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900">` +
        `<a:solidFill><a:srgbClr val="374151"/></a:solidFill></a:defRPr></a:pPr>` +
        `<a:endParaRPr lang="pt-BR"/></a:p></c:txPr></c:legend>` +
        `<c:plotVisOnly val="1"/>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    `<c:roundedCorners val="0"/><c:chart>` +
    `<c:title>${txtCorpo(p.titulo, 1200, 1)}<c:overlay val="0"/>` +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:title>` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    plotXml(p, idCat, idVal) +
    eixosXml(p, idCat, idVal) +
    `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>` +
    `</c:plotArea>${legenda}<c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln>` +
    `</c:spPr>` +
    `</c:chartSpace>`
  );
}

function drawingXml(pedidos: PedidoGrafico[], primeiroRid: number): string {
  const ancoras = pedidos
    .map((p, i) => {
      const a = p.ancora;
      // Âncora 1-based na API (como o resto do projeto) e 0-based no XML.
      const c0 = a.col - 1;
      const l0 = a.linha - 1;
      return (
        `<xdr:twoCellAnchor editAs="oneCell">` +
        `<xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${l0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${c0 + a.largura}</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${l0 + a.altura}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr>` +
        `<xdr:cNvPr id="${i + 2}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/>` +
        `</xdr:nvGraphicFramePr>` +
        `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="${NS_C}">` +
        `<c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rId${primeiroRid + i}"/>` +
        `</a:graphicData></a:graphic></xdr:graphicFrame>` +
        `<xdr:clientData/></xdr:twoCellAnchor>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${ancoras}</xdr:wsDr>`
  );
}

function relsXml(itens: { id: number; tipo: string; alvo: string }[]): string {
  const rs = itens
    .map(
      (i) =>
        `<Relationship Id="rId${i.id}" Type="${i.tipo}" Target="${i.alvo}"/>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${rs}</Relationships>`
  );
}

/** Descobre qual `xl/worksheets/sheetN.xml` corresponde a cada nome de aba. */
async function mapaDasAbas(zip: JSZip): Promise<Map<string, string>> {
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const relsTxt = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");

  const rel = new Map<string, string>();
  for (const m of relsTxt.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rel.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const mapa = new Map<string, string>();
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    const nome = /name="([^"]*)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (!nome || !rid) continue;
    const alvo = rel.get(rid);
    if (!alvo) continue;
    // O nome vem escapado no XML; desfazer para casar com o que o chamador passa.
    const limpo = nome
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    mapa.set(limpo, `xl/${alvo}`);
  }
  return mapa;
}

/**
 * Acrescenta gráficos nativos a uma planilha já escrita pelo exceljs.
 *
 * Recebe e devolve o buffer do .xlsx; não altera nada do que já estava lá.
 * Pedido cuja aba não existe é ignorado em silêncio? Não — estoura, porque aba
 * renomeada é justamente o erro que passaria despercebido até alguém abrir o
 * arquivo e não achar o gráfico.
 */
export async function comGraficos(
  buffer: ArrayBuffer | Buffer,
  pedidos: PedidoGrafico[],
): Promise<Buffer> {
  if (!pedidos.length) return Buffer.from(buffer as ArrayBuffer);

  const zip = await JSZip.loadAsync(buffer);
  const abas = await mapaDasAbas(zip);

  // Agrupa por aba: cada aba tem UM drawing, com N gráficos dentro.
  const porAba = new Map<string, PedidoGrafico[]>();
  for (const p of pedidos) {
    if (!abas.has(p.aba)) {
      throw new Error(
        `[excel-graficos] aba "${p.aba}" não existe na planilha ` +
          `(existem: ${[...abas.keys()].join(", ")})`,
      );
    }
    const lista = porAba.get(p.aba) ?? [];
    lista.push(p);
    porAba.set(p.aba, lista);
  }

  let seqGrafico = 0;
  let seqDesenho = 0;
  const tiposNovos: string[] = [];

  for (const [aba, lista] of porAba) {
    seqDesenho++;
    const caminhoAba = abas.get(aba)!;
    const nomeArqAba = caminhoAba.split("/").pop()!;

    // 1) os charts
    const idsChart: number[] = [];
    for (const p of lista) {
      seqGrafico++;
      idsChart.push(seqGrafico);
      zip.file(`xl/charts/chart${seqGrafico}.xml`, chartXml(p, seqGrafico));
      tiposNovos.push(
        `<Override PartName="/xl/charts/chart${seqGrafico}.xml" ` +
          `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      );
    }

    // 2) o drawing que ancora os charts na aba
    zip.file(`xl/drawings/drawing${seqDesenho}.xml`, drawingXml(lista, 1));
    zip.file(
      `xl/drawings/_rels/drawing${seqDesenho}.xml.rels`,
      relsXml(
        idsChart.map((id, i) => ({
          id: i + 1,
          tipo: `${NS_R}/chart`,
          alvo: `../charts/chart${id}.xml`,
        })),
      ),
    );
    tiposNovos.push(
      `<Override PartName="/xl/drawings/drawing${seqDesenho}.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    );

    // 3) ligar o drawing na aba (.rels da aba)
    const caminhoRels = `xl/worksheets/_rels/${nomeArqAba}.rels`;
    const arqRels = zip.file(caminhoRels);
    let ridDesenho: number;
    if (arqRels) {
      const txt = await arqRels.async("string");
      const usados = [...txt.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
      ridDesenho = (usados.length ? Math.max(...usados) : 0) + 1;
      const novo = txt.replace(
        "</Relationships>",
        `<Relationship Id="rId${ridDesenho}" Type="${NS_R}/drawing" ` +
          `Target="../drawings/drawing${seqDesenho}.xml"/></Relationships>`,
      );
      zip.file(caminhoRels, novo);
    } else {
      ridDesenho = 1;
      zip.file(
        caminhoRels,
        relsXml([
          {
            id: 1,
            tipo: `${NS_R}/drawing`,
            alvo: `../drawings/drawing${seqDesenho}.xml`,
          },
        ]),
      );
    }

    // 4) o <drawing/> dentro do XML da aba.
    //
    // A ORDEM importa: o schema manda `drawing` ANTES de `tableParts`. Enfiar
    // sempre antes de `</worksheet>` funciona até a aba ganhar uma tabela — e aí
    // o arquivo abre pedindo reparo, sem nenhuma outra pista do motivo.
    const xmlAba = await zip.file(caminhoAba)!.async("string");
    if (!/<drawing\b/.test(xmlAba)) {
      const tag = `<drawing r:id="rId${ridDesenho}"/>`;
      const iTabela = xmlAba.indexOf("<tableParts");
      const novo =
        iTabela >= 0
          ? xmlAba.slice(0, iTabela) + tag + xmlAba.slice(iTabela)
          : xmlAba.replace("</worksheet>", `${tag}</worksheet>`);
      zip.file(caminhoAba, novo);
    }
  }

  // 5) declarar os tipos novos
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file("[Content_Types].xml", ct.replace("</Types>", `${tiposNovos.join("")}</Types>`));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
