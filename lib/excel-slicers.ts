// Slicers de TABELA — os botões de filtro que fazem a planilha parecer um painel.
//
// Mesmo caminho de `lib/excel-graficos.ts`: o exceljs escreve o arquivo, o zip é
// reaberto e as partes novas entram por cima. A diferença é o risco, e ele
// precisa estar dito aqui em cima.
//
// ────────────────────────────── o que é um slicer ──────────────────────────────
//
// Slicer é filtro de tabela com cara de botão. Ele NÃO é do formato base do
// xlsx: é uma extensão da Microsoft (`x14`/`x15`), declarada em `extLst`, e por
// isso mora fora do que o schema padrão descreve. São cinco partes amarradas:
//
//   slicerCache  ── diz QUAL tabela e QUAL coluna (por id, não por nome)
//   slicer       ── diz como o botão aparece
//   worksheet    ── extLst + rels, para a aba saber que tem slicer
//   workbook     ── extLst + rels, para o arquivo saber que tem cache
//   drawing      ── a âncora, dentro de um mc:AlternateContent
//
// ──────────────────────── o preço, e ele é maior que o do gráfico ────────────────
//
// 1. NÃO DÁ PARA CONFERIR AQUI. O LibreOffice não implementa slicer: ele abre o
//    arquivo e ignora os botões. Isso é ótimo como prova de que o arquivo não
//    está corrompido — e é inútil como prova de que o slicer funciona. Quem
//    valida isso é o Excel, e o Excel não roda nesta máquina. Está anotado na
//    decisão 41: o teste que falta é abrir uma vez no Excel de verdade.
//
// 2. É POR ISSO QUE O `mc:AlternateContent` IMPORTA. Ele diz "se você não
//    entende slicer, pule este bloco" — e é o que faz o LibreOffice degradar
//    para uma planilha sem botões em vez de reclamar do arquivo.
//
// 3. E É POR ISSO QUE A TABELA MANTÉM O AUTOFILTRO. O `filterButton: true` no
//    `addTable` não é decoração: se o slicer falhar em qualquer leitor, os
//    menus de filtro do cabeçalho continuam filtrando, os KPIs de SUBTOTAL
//    continuam respondendo, e o painel continua interativo — só mais feio. Uma
//    interatividade que depende inteiramente da parte não verificável seria uma
//    aposta, não uma entrega.
import JSZip from "jszip";

export type PedidoSlicer = {
  /** Aba onde o slicer é DESENHADO (pode não ser a da tabela). */
  aba: string;
  /** `name` da tabela, como passado ao `addTable`. */
  tabela: string;
  /** Nome da coluna da tabela que este slicer filtra. */
  coluna: string;
  /** O título no alto do botão. Sem isto, usa o nome da coluna. */
  titulo?: string;
  /** Canto superior esquerdo (1-based) e tamanho em células. */
  ancora: { col: number; linha: number; largura: number; altura: number };
  /** Colunas de botões dentro do slicer. */
  colunas?: number;
};

const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_MS = "http://schemas.microsoft.com/office/2007/relationships";
const NS_X14 = "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main";
const NS_X15 = "http://schemas.microsoft.com/office/spreadsheetml/2010/11/main";
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const NS_SLE = "http://schemas.microsoft.com/office/drawing/2010/slicer";

/** GUID que a Microsoft usa para marcar "este cache é de tabela, não de pivot". */
const URI_TABLE_SLICER = "{2F2917AC-EB37-4324-AD4E-5DD8C200BD13}";
const URI_SLICER_CACHES = "{BBE1A952-AA13-448e-AADC-164F8A28A991}";
const URI_SLICER_LIST = "{A8765BA9-456A-4dab-B4F3-ACF1056F45AB}";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Nome interno do cache.
 *
 * Vira um "defined name" do Excel, e defined name não aceita espaço nem
 * acento — "Operadora do caso" viraria um arquivo que não abre.
 */
export function nomeDeCache(coluna: string): string {
  const limpo = coluna
    .normalize("NFD")
    // Faixa dos diacríticos combinantes, por código: escrever os acentos
    // literalmente aqui deixa o regex à mercê do editor que abrir o arquivo.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_");
  return `Slicer_${limpo || "Coluna"}`;
}

type Tabela = { id: string; nome: string; colunas: { id: string; nome: string }[] };

async function lerTabelas(zip: JSZip): Promise<Map<string, Tabela>> {
  const mapa = new Map<string, Tabela>();
  for (const caminho of Object.keys(zip.files)) {
    if (!/^xl\/tables\/table\d+\.xml$/.test(caminho)) continue;
    const xml = await zip.file(caminho)!.async("string");
    const id = /\bid="(\d+)"/.exec(xml)?.[1];
    const nome = /\bname="([^"]+)"/.exec(xml)?.[1];
    if (!id || !nome) continue;
    const colunas = [...xml.matchAll(/<tableColumn\b[^>]*\/?>/g)]
      .map((m) => ({
        id: /\bid="(\d+)"/.exec(m[0])?.[1] ?? "",
        nome: /\bname="([^"]*)"/.exec(m[0])?.[1] ?? "",
      }))
      .filter((c) => c.id);
    mapa.set(nome, { id, nome, colunas });
  }
  return mapa;
}

async function mapaDasAbas(zip: JSZip): Promise<Map<string, string>> {
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const relsTxt = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const rel = new Map<string, string>();
  for (const m of relsTxt.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rel.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const mapa = new Map<string, string>();
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nome = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const alvo = rid ? rel.get(rid) : undefined;
    if (!nome || !alvo) continue;
    mapa.set(
      nome
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"),
      `xl/${alvo}`,
    );
  }
  return mapa;
}

function cacheXml(cache: string, coluna: string, tabelaId: string, colunaId: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<slicerCacheDefinition xmlns="${NS_X14}" xmlns:mc="${NS_MC}" xmlns:x="${NS_MAIN}" ` +
    `mc:Ignorable="x15" xmlns:x15="${NS_X15}" ` +
    `name="${esc(cache)}" sourceName="${esc(coluna)}">` +
    `<extLst><ext uri="${URI_TABLE_SLICER}" xmlns:x15="${NS_X15}">` +
    `<x15:tableSlicerCache tableId="${tabelaId}" column="${colunaId}"/>` +
    `</ext></extLst>` +
    `</slicerCacheDefinition>`
  );
}

function slicersXml(itens: { nome: string; cache: string; titulo: string; colunas: number }[]): string {
  const corpo = itens
    .map(
      (s) =>
        `<slicer name="${esc(s.nome)}" cache="${esc(s.cache)}" ` +
        `caption="${esc(s.titulo)}" columnCount="${s.colunas}" ` +
        `style="SlicerStyleLight1" rowHeight="241300"/>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<slicers xmlns="${NS_X14}" xmlns:r="${NS_R}">${corpo}</slicers>`
  );
}

/**
 * A âncora do slicer no desenho da aba.
 *
 * Vai dentro de `mc:AlternateContent`: o `mc:Choice Requires="sle"` só é lido
 * por quem declara entender slicer, e o `mc:Fallback` vazio manda o resto dos
 * leitores pularem o bloco em silêncio. É essa moldura que transforma "arquivo
 * corrompido no LibreOffice" em "planilha sem os botões".
 */
function ancoraXml(
  s: { nome: string; ancora: PedidoSlicer["ancora"] },
  seq: number,
): string {
  const c0 = s.ancora.col - 1;
  const l0 = s.ancora.linha - 1;
  return (
    `<mc:AlternateContent xmlns:mc="${NS_MC}">` +
    `<mc:Choice xmlns:sle="${NS_SLE}" Requires="sle">` +
    `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${l0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${c0 + s.ancora.largura}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${l0 + s.ancora.altura}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr><xdr:cNvPr id="${500 + seq}" name="${esc(s.nome)}"/>` +
    `<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_SLE}">` +
    `<sle:slicer xmlns:sle="${NS_SLE}" name="${esc(s.nome)}"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame>` +
    `<xdr:clientData/></xdr:twoCellAnchor>` +
    `</mc:Choice><mc:Fallback/></mc:AlternateContent>`
  );
}

function relsXml(itens: { id: number; tipo: string; alvo: string }[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    itens
      .map((i) => `<Relationship Id="rId${i.id}" Type="${i.tipo}" Target="${i.alvo}"/>`)
      .join("") +
    `</Relationships>`
  );
}

/** Acrescenta uma relação a um .rels existente (ou cria o arquivo). */
async function ligar(
  zip: JSZip,
  caminho: string,
  tipo: string,
  alvo: string,
): Promise<number> {
  const arq = zip.file(caminho);
  if (!arq) {
    zip.file(caminho, relsXml([{ id: 1, tipo, alvo }]));
    return 1;
  }
  const txt = await arq.async("string");
  const usados = [...txt.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  const id = (usados.length ? Math.max(...usados) : 0) + 1;
  zip.file(
    caminho,
    txt.replace(
      "</Relationships>",
      `<Relationship Id="rId${id}" Type="${tipo}" Target="${alvo}"/></Relationships>`,
    ),
  );
  return id;
}

/**
 * Acrescenta slicers de tabela a uma planilha já escrita.
 *
 * Precisa rodar DEPOIS de `comGraficos`: os dois escrevem no mesmo desenho da
 * aba, e este aqui sabe acrescentar ao desenho que já existe — o contrário não
 * é verdade.
 */
export async function comSlicers(
  buffer: ArrayBuffer | Buffer,
  pedidos: PedidoSlicer[],
): Promise<Buffer> {
  if (!pedidos.length) return Buffer.from(buffer as ArrayBuffer);

  const zip = await JSZip.loadAsync(buffer);
  const tabelas = await lerTabelas(zip);
  const abas = await mapaDasAbas(zip);

  const porAba = new Map<string, PedidoSlicer[]>();
  for (const p of pedidos) {
    const t = tabelas.get(p.tabela);
    if (!t) {
      throw new Error(
        `[excel-slicers] tabela "${p.tabela}" não existe ` +
          `(existem: ${[...tabelas.keys()].join(", ") || "nenhuma"})`,
      );
    }
    if (!t.colunas.some((c) => c.nome === p.coluna)) {
      throw new Error(
        `[excel-slicers] a tabela "${p.tabela}" não tem a coluna "${p.coluna}" ` +
          `(tem: ${t.colunas.map((c) => c.nome).join(", ")})`,
      );
    }
    if (!abas.has(p.aba)) {
      throw new Error(`[excel-slicers] aba "${p.aba}" não existe na planilha`);
    }
    const lista = porAba.get(p.aba) ?? [];
    lista.push(p);
    porAba.set(p.aba, lista);
  }

  const tipos: string[] = [];
  let seqCache = 0;
  let seqSlicer = 0;

  for (const [aba, lista] of porAba) {
    const caminhoAba = abas.get(aba)!;
    const nomeArq = caminhoAba.split("/").pop()!;

    // 1) um cache por slicer, e a ligação dele no WORKBOOK (não na aba: o cache
    //    é do arquivo, e duas abas podem mostrar o mesmo filtro).
    const ridsCache: number[] = [];
    const declaracoes: { nome: string; cache: string; titulo: string; colunas: number }[] = [];
    for (const p of lista) {
      seqCache++;
      const t = tabelas.get(p.tabela)!;
      const col = t.colunas.find((c) => c.nome === p.coluna)!;
      const cache = nomeDeCache(p.coluna);
      zip.file(
        `xl/slicerCaches/slicerCache${seqCache}.xml`,
        cacheXml(cache, p.coluna, t.id, col.id),
      );
      tipos.push(
        `<Override PartName="/xl/slicerCaches/slicerCache${seqCache}.xml" ` +
          `ContentType="application/vnd.ms-excel.slicerCache+xml"/>`,
      );
      ridsCache.push(
        await ligar(
          zip,
          "xl/_rels/workbook.xml.rels",
          `${NS_MS}/slicerCache`,
          `slicerCaches/slicerCache${seqCache}.xml`,
        ),
      );
      declaracoes.push({
        nome: p.coluna,
        cache,
        titulo: p.titulo ?? p.coluna,
        colunas: p.colunas ?? 1,
      });
    }

    // 2) a parte `slicers` da aba — uma por aba, com todos dentro.
    seqSlicer++;
    zip.file(`xl/slicers/slicer${seqSlicer}.xml`, slicersXml(declaracoes));
    tipos.push(
      `<Override PartName="/xl/slicers/slicer${seqSlicer}.xml" ` +
        `ContentType="application/vnd.ms-excel.slicer+xml"/>`,
    );
    const ridSlicer = await ligar(
      zip,
      `xl/worksheets/_rels/${nomeArq}.rels`,
      `${NS_MS}/slicer`,
      `../slicers/slicer${seqSlicer}.xml`,
    );

    // 3) o extLst da aba. Diferente do <drawing>, `extLst` é o ÚLTIMO elemento
    //    de <worksheet> — inclusive depois de <tableParts> —, então entrar
    //    colado no fechamento é a posição certa, e não um atalho.
    const xmlAba = await zip.file(caminhoAba)!.async("string");
    const extAba =
      `<extLst><ext uri="${URI_SLICER_LIST}" xmlns:x14="${NS_X14}">` +
      `<x14:slicerList><x14:slicer r:id="rId${ridSlicer}"/></x14:slicerList>` +
      `</ext></extLst>`;
    zip.file(caminhoAba, xmlAba.replace("</worksheet>", `${extAba}</worksheet>`));

    // 4) a âncora, no desenho que os gráficos já podem ter criado.
    const relsAba = await zip
      .file(`xl/worksheets/_rels/${nomeArq}.rels`)!
      .async("string");
    const alvoDesenho = /Target="\.\.\/(drawings\/drawing\d+\.xml)"/.exec(relsAba)?.[1];
    const ancoras = lista
      .map((p, i) => ancoraXml({ nome: p.coluna, ancora: p.ancora }, seqCache + i))
      .join("");

    if (alvoDesenho) {
      const caminhoDesenho = `xl/${alvoDesenho}`;
      const atual = await zip.file(caminhoDesenho)!.async("string");
      zip.file(caminhoDesenho, atual.replace("</xdr:wsDr>", `${ancoras}</xdr:wsDr>`));
    } else {
      const nDesenho = seqSlicer;
      zip.file(
        `xl/drawings/drawing_slicer${nDesenho}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${ancoras}</xdr:wsDr>`,
      );
      tipos.push(
        `<Override PartName="/xl/drawings/drawing_slicer${nDesenho}.xml" ` +
          `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      );
      const ridDesenho = await ligar(
        zip,
        `xl/worksheets/_rels/${nomeArq}.rels`,
        `${NS_R}/drawing`,
        `../drawings/drawing_slicer${nDesenho}.xml`,
      );
      const xml2 = await zip.file(caminhoAba)!.async("string");
      // <drawing> vem antes de <extLst>; como o extLst acabou de ser escrito
      // colado no fecho, ancorar nele mantém a ordem do schema.
      zip.file(
        caminhoAba,
        xml2.replace("<extLst>", `<drawing r:id="rId${ridDesenho}"/><extLst>`),
      );
    }
  }

  // 5) o extLst do workbook, com todos os caches do arquivo.
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const idsCache = [...wbRels.matchAll(/Id="(rId\d+)"[^>]*slicerCaches\//g)].map(
    (m) => m[1],
  );
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const extWb =
    `<extLst><ext uri="${URI_SLICER_CACHES}" xmlns:x14="${NS_X14}">` +
    `<x14:slicerCaches>` +
    idsCache.map((id) => `<x14:slicerCache r:id="${id}"/>`).join("") +
    `</x14:slicerCaches></ext></extLst>`;
  zip.file("xl/workbook.xml", wbXml.replace("</workbook>", `${extWb}</workbook>`));

  // 6) declarar os tipos novos
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file("[Content_Types].xml", ct.replace("</Types>", `${tipos.join("")}</Types>`));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
