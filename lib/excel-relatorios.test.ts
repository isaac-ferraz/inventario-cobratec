import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  gerarWorkbookRelatorios,
  type Contexto,
  type DadosDaPlanilha,
} from "@/lib/excel-relatorios";
import type { AbaChave } from "@/lib/relatorios-abas";

// O foco aqui é a aba "Painel interativo" (decisão 41), porque ela é a única do
// arquivo cujo valor NÃO está no que foi escrito, e sim no que recalcula depois.
// Uma fórmula trocada por um número gera uma planilha que parece certa e não
// responde a filtro nenhum — e ninguém percebe, porque os valores iniciais
// estão corretos.

const OPERADORAS = ["Ana Souza", "Bruno Lima", "Carla Dias"];
const CARTEIRAS = ["FESTCARD", "COOPEREMB"];

function contexto(abas: AbaChave[]): Contexto {
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

async function gerar(abas: AbaChave[], d: DadosDaPlanilha = dados()) {
  return JSZip.loadAsync(await gerarWorkbookRelatorios(contexto(abas), d));
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
