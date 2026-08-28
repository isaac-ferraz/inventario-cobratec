import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  gerarWorkbookRelatorios,
  type Contexto,
  type DadosDaPlanilha,
  type Publico,
} from "@/lib/excel-relatorios";
import type { AbaChave } from "@/lib/relatorios-abas";

// O foco aqui é a aba "Painel interativo" (decisão 41), porque ela é a única do
// arquivo cujo valor NÃO está no que foi escrito, e sim no que recalcula depois.
// Uma fórmula trocada por um número gera uma planilha que parece certa e não
// responde a filtro nenhum — e ninguém percebe, porque os valores iniciais
// estão corretos.

const OPERADORAS = ["Ana Souza", "Bruno Lima", "Carla Dias"];
const CARTEIRAS = ["FESTCARD", "COOPEREMB"];

function contexto(abas: AbaChave[], publico?: Publico): Contexto {
  return {
    periodo: { inicio: "2026-07-20", fim: "2026-08-19", rotulo: "20/07 a 19/08" },
    janela: { inicio: "2026-08-19", fim: "2026-09-18", rotulo: "19/08 a 18/09" },
    hoje: "2026-08-19",
    filtro: {
      inicio: "2026-07-20",
      fim: "2026-08-19",
      carteiras: null,
      equipes: null,
      operadoras: null,
    },
    recorte: { carteiras: [], equipes: [], operadoras: [] },
    exportadoPor: "teste",
    exportadoEm: new Date("2026-08-19T12:00:00Z"),
    abas,
    publico,
  };
}

function dados(): DadosDaPlanilha {
  const celulas = OPERADORAS.flatMap((o, i) =>
    CARTEIRAS.map((c, j) => ({
      operadora: i + 1,
      operadoraNome: o,
      carteira: j + 1,
      carteiraNome: c,
      qtd: 3 + i + j,
      valor: 1000 * (i + 1) + 100 * (j + 1),
    })),
  );
  return {
    acordos: {
      qtd: 30,
      valor: 12345.6,
      porOperadora: OPERADORAS.map((o, i) => ({
        chave: i + 1,
        rotulo: o,
        qtd: 10,
        valor: 4000,
      })),
      porCarteira: [],
      porHora: [],
      porMes: [],
      matriz: { celulas, truncada: false },
    },
  };
}

async function gerar(
  abas: AbaChave[],
  d: DadosDaPlanilha = dados(),
  publico?: Publico,
) {
  return JSZip.loadAsync(await gerarWorkbookRelatorios(contexto(abas, publico), d));
}

/**
 * Todo o texto do arquivo, de todas as partes do zip.
 *
 * Procurar só na aba não serve: o Excel guarda os textos repetidos em
 * `sharedStrings.xml`, e um nome que "não está" na aba pode estar ali. Para
 * afirmar que um nome NÃO saiu da empresa, o lugar onde se procura é o arquivo
 * inteiro.
 */
async function textoInteiro(zip: JSZip): Promise<string> {
  const partes = await Promise.all(
    Object.keys(zip.files)
      .filter((n) => n.endsWith(".xml"))
      .map((n) => zip.file(n)!.async("string")),
  );
  return partes.join("\n");
}

async function abasDo(zip: JSZip): Promise<string[]> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  return [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => m[1]);
}

describe("planilha de relatórios — painel interativo", () => {
  it("não cria as abas quando o painel não foi pedido", async () => {
    const zip = await gerar(["parametros", "resumo"]);
    const nomes = await abasDo(zip);
    expect(nomes).not.toContain("Painel interativo");
    expect(nomes).not.toContain("Dados");
    expect(zip.file("xl/slicers/slicer1.xml")).toBeNull();
  });

  it("cria as duas abas e os slicers quando pedido", async () => {
    const zip = await gerar(["parametros", "painel-interativo"]);
    const nomes = await abasDo(zip);
    expect(nomes).toContain("Dados");
    expect(nomes).toContain("Painel interativo");
    expect(zip.file("xl/tables/table1.xml")).not.toBeNull();

    const slicers = await zip.file("xl/slicers/slicer1.xml")!.async("string");
    expect(slicers).toContain('name="Operadora"');
    expect(slicers).toContain('name="Carteira"');
  });

  it("deixa o autofiltro da tabela VISÍVEL — é o plano B do slicer", async () => {
    // hiddenButton="0" é botão mostrado. Sem isto, quem não tiver slicer fica
    // com uma planilha sem interação nenhuma.
    const zip = await gerar(["parametros", "painel-interativo"]);
    const tabela = await zip.file("xl/tables/table1.xml")!.async("string");
    expect(tabela).toContain('hiddenButton="0"');
    expect(tabela).not.toContain('hiddenButton="1"');
  });

  it("os KPIs são FÓRMULA de SUBTOTAL, não número gravado", async () => {
    // SUBTOTAL(109; ...) é o que ignora linha escondida por filtro. Trocado por
    // um número, o cartão mostra o total certo e nunca mais se mexe.
    const zip = await gerar(["parametros", "painel-interativo"]);
    const nomes = await abasDo(zip);
    const idx = nomes.indexOf("Painel interativo") + 1;
    const aba = await zip.file(`xl/worksheets/sheet${idx}.xml`)!.async("string");
    expect(aba).toContain("SUBTOTAL(109,Acordos[Acordos])");
    expect(aba).toContain("SUBTOTAL(109,Acordos[Valor])");
  });

  it("o resumo por operadora soma por critério E respeita o filtro", async () => {
    // SOMASE ignora o filtro; SUBTOTAL não aceita critério. Só a combinação
    // SUMPRODUCT + SUBTOTAL + OFFSET faz as duas coisas ao mesmo tempo.
    const zip = await gerar(["parametros", "painel-interativo"]);
    const nomes = await abasDo(zip);
    const idx = nomes.indexOf("Painel interativo") + 1;
    const aba = await zip.file(`xl/worksheets/sheet${idx}.xml`)!.async("string");
    expect(aba).toContain("SUMPRODUCT(SUBTOTAL(109,OFFSET(Dados!$D$2");
    // O critério de um bloco olha a coluna A (operadora) e o do outro a B
    // (carteira) — cruzados com os slicers de propósito.
    expect(aba).toContain("Dados!$A$2:$A$7=");
    expect(aba).toContain("Dados!$B$2:$B$7=");
  });

  it("sobrevive a um recorte sem acordo nenhum", async () => {
    // Matriz vazia é resposta legítima. O painel não deve nascer meio feito, com
    // tabela sem linha e gráfico apontando para o vazio.
    const vazio: DadosDaPlanilha = {
      acordos: {
        qtd: 0,
        valor: 0,
        porOperadora: [],
        porCarteira: [],
        porHora: [],
        porMes: [],
        matriz: { celulas: [], truncada: false },
      },
    };
    const zip = await gerar(["parametros", "painel-interativo"], vazio);
    const nomes = await abasDo(zip);
    expect(nomes).not.toContain("Painel interativo");
    expect(zip.file("xl/slicers/slicer1.xml")).toBeNull();
  });
});

// ─────────────────────────── a planilha do cliente ───────────────────────────
//
// Esta é a planilha que SAI DA EMPRESA. O que se testa aqui não é formatação: é
// que nome de operadora não vai junto. E a ausência só vale como teste se o
// mesmo teste souber detectar a presença — por isso o par de casos abaixo usa os
// MESMOS dados e só troca o público.

/** A comissão de mentira, com a ressalva que viaja colada ao número. */
function comissao(): NonNullable<DadosDaPlanilha["comissao"]> {
  return {
    qtd: 12,
    valor: 3400.5,
    recebido: 18000,
    porOperadora: OPERADORAS.map((o, i) => ({
      chave: i + 1,
      rotulo: o,
      qtd: 4,
      valor: 1133.5,
    })),
    porCarteira: [],
    porMes: [
      { chave: 202607, rotulo: "07/2026", qtd: 5, valor: 1400.5 },
      { chave: 202608, rotulo: "08/2026", qtd: 7, valor: 2000 },
    ],
    matriz: { celulas: [], truncada: false },
    conferida: false,
    ressalva: "Comissão ainda não conferida contra o relatório oficial do Siscobra.",
  };
}

describe("planilha de relatórios — modo cliente", () => {
  it("recusa a planilha NOMEANDO a aba proibida", async () => {
    // Recusa, e não aba vazia: entregar sem a aba, calado, produz um arquivo que
    // parece completo. E nomear a aba é o que evita a pessoa adivinhar qual das
    // onze desmarcar.
    await expect(
      gerar(["parametros", "acordos-operadora"], dados(), "cliente"),
    ).rejects.toThrow(/Acordos · operadora/);
  });

  it("recusa também a lista nominal de devedores", async () => {
    await expect(
      gerar(["parametros", "parcelas"], dados(), "cliente"),
    ).rejects.toThrow(/Parcelas/);
  });

  it("o Resumo NÃO escreve nome de operadora, nem tendo os dados em mãos", async () => {
    // O ponto do caso: a aba "Acordos · operadora" nem foi pedida. Quem
    // desenhava o bloco das 12 maiores era o próprio Resumo, a partir de
    // `d.acordos.porOperadora` — escolher as abas certas não bastava.
    const d = { ...dados(), comissao: comissao() };
    const zip = await gerar(["parametros", "resumo"], d, "cliente");
    const texto = await textoInteiro(zip);
    for (const nome of OPERADORAS) expect(texto).not.toContain(nome);
  });

  it("e o mesmo Resumo, no modo interno, escreve — senão o teste acima não prova nada",
    async () => {
      const d = { ...dados(), comissao: comissao() };
      const zip = await gerar(["parametros", "resumo"], d);
      const texto = await textoInteiro(zip);
      expect(texto).toContain(OPERADORAS[0]);
    });

  it("a capa diz que é a versão do cliente", async () => {
    const zip = await gerar(["parametros", "resumo"], dados(), "cliente");
    const texto = await textoInteiro(zip);
    expect(texto).toContain("sem nome de operadora");
  });

  it("a aba de honorários traz o total e a ressalva, sem operadora", async () => {
    const d: DadosDaPlanilha = { comissao: comissao() };
    const zip = await gerar(["parametros", "comissao-resumo"], d, "cliente");
    expect(await abasDo(zip)).toContain("Honorários");
    const texto = await textoInteiro(zip);
    expect(texto).toContain("não conferida contra o relatório oficial");
    expect(texto).toContain("07/2026");
    for (const nome of OPERADORAS) expect(texto).not.toContain(nome);
  });

  it("a aba da base separa ficha de devedor cadastrado", async () => {
    // São dois números diferentes e é fácil confundi-los: numa carteira
    // recém-carregada, 103 cadastrados e 5 fichas com saldo.
    const d: DadosDaPlanilha = {
      base: {
        fichas: 5,
        contratos: 5,
        saldo: 3461.46,
        cadastrados: 103,
        porCarteira: [{ chave: 1163, rotulo: "REDE DROGAL", qtd: 5, valor: 3461.46 }],
      },
    };
    const zip = await gerar(["parametros", "carteira-base"], d, "cliente");
    expect(await abasDo(zip)).toContain("Carteira · base");
    const texto = await textoInteiro(zip);
    expect(texto).toContain("REDE DROGAL");
    expect(texto).toContain("Devedores cadastrados");
    expect(texto).toContain("TOTAL");
  });

  it("a base vazia diz que está vazia em vez de sair muda", async () => {
    const d: DadosDaPlanilha = {
      base: { fichas: 0, contratos: 0, saldo: 0, cadastrados: 0, porCarteira: [] },
    };
    const zip = await gerar(["parametros", "carteira-base"], d, "cliente");
    const texto = await textoInteiro(zip);
    expect(texto).toContain("Nenhum contrato em aberto no recorte");
  });
});
