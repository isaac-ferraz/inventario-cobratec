// A carteira — o que acontece com as linhas DEPOIS que o banco responde.
//
// O Siscobra é dublê: as consultas de verdade foram rodadas contra o CRM
// durante a construção, e a cobertura da baixa tem script próprio
// (`scripts/validar-parcelas.ts`). O que se testa aqui é a montagem dos eixos —
// preenchimento de dia vazio, ordem das faixas de atraso e a posição de "hoje"
// dentro da janela. Nada disso dá erro quando quebra: dá um gráfico errado.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/siscobra", () => ({
  configSiscobra: vi.fn(() => true),
  consultaRelatorio: vi.fn(),
}));

import { consultaRelatorio } from "@/lib/siscobra";
import { SEM_RECORTE } from "@/lib/relatorios-cobranca";
import {
  aVencerEm,
  emAtrasoAte,
  primeiraParcelaDe,
} from "@/lib/relatorios-carteira";

const TODAS = { ...SEM_RECORTE };

function responde(linhas: unknown[]) {
  vi.mocked(consultaRelatorio).mockResolvedValue(linhas as never);
}

beforeEach(() => vi.clearAllMocks());

describe("aVencerEm — a agenda", () => {
  it("preenche o dia sem vencimento em vez de omiti-lo", async () => {
    // O caso real é o fim de semana. Sem o buraco, sexta e segunda ficam
    // coladas e o gráfico conta que a cobrança teve três dias seguidos.
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 5, valor: 1000 },
      { eixo: "dia", chave: 0, rotulo: "14/08", qtd: 3, valor: 600 },
      { eixo: "dia", chave: 3, rotulo: "17/08", qtd: 2, valor: 400 },
    ]);

    const r = await aVencerEm(
      { inicio: "2026-08-14", fim: "2026-08-17", ...TODAS },
      "2026-08-14",
    );

    expect(r.porDia).toHaveLength(4);
    expect(r.porDia.map((d) => d.qtd)).toEqual([3, 0, 0, 2]);
    // O dia vazio ainda precisa de rótulo, senão o eixo pula um número.
    expect(r.porDia[1].rotulo).toBe("15/08");
    expect(r.porDia[2].rotulo).toBe("16/08");
  });

  it("hoje e amanhã são posições na janela, não a primeira coluna", async () => {
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 4, valor: 900 },
      { eixo: "dia", chave: 0, rotulo: "20/08", qtd: 4, valor: 900 },
    ]);

    // Janela personalizada que começa daqui a uma semana: nada vence hoje, e a
    // primeira coluna do gráfico NÃO é hoje.
    const r = await aVencerEm(
      { inicio: "2026-08-20", fim: "2026-08-22", ...TODAS },
      "2026-08-14",
    );

    expect(r.hoje).toEqual({ qtd: 0, valor: 0 });
    expect(r.amanha).toEqual({ qtd: 0, valor: 0 });
    expect(r.qtd).toBe(4);
  });

  it("acha hoje e amanhã quando a janela começa hoje", async () => {
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 9, valor: 3000 },
      { eixo: "dia", chave: 0, rotulo: "14/08", qtd: 2, valor: 500 },
      { eixo: "dia", chave: 1, rotulo: "15/08", qtd: 7, valor: 2500 },
    ]);

    const r = await aVencerEm(
      { inicio: "2026-08-14", fim: "2026-08-16", ...TODAS },
      "2026-08-14",
    );

    expect(r.hoje).toEqual({ qtd: 2, valor: 500 });
    expect(r.amanha).toEqual({ qtd: 7, valor: 2500 });
  });

  it("ordena carteira e operadora por valor, que é o que se cobra", async () => {
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 3, valor: 300 },
      { eixo: "carteira", chave: 1, rotulo: "PEQUENA", qtd: 2, valor: 50 },
      { eixo: "carteira", chave: 2, rotulo: "GRANDE", qtd: 1, valor: 250 },
    ]);

    const r = await aVencerEm(
      { inicio: "2026-08-14", fim: "2026-08-14", ...TODAS },
      "2026-08-14",
    );
    expect(r.porCarteira.map((c) => c.rotulo)).toEqual(["GRANDE", "PEQUENA"]);
  });

  it("rótulo em branco vira o texto de ausência, não uma linha muda", async () => {
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 1, valor: 10 },
      { eixo: "operadora", chave: null, rotulo: "   ", qtd: 1, valor: 10 },
    ]);
    const r = await aVencerEm(
      { inicio: "2026-08-14", fim: "2026-08-14", ...TODAS },
      "2026-08-14",
    );
    expect(r.porOperadora[0].rotulo).toBe("(sem operadora)");
  });
});

describe("emAtrasoAte — o aging", () => {
  it("mantém as faixas em ordem de gravidade, não de tamanho", async () => {
    // A forma da escada é a mensagem. Ordenar por valor colocaria "mais de 60
    // dias" no topo e faria o aging parecer um ranking.
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 100, valor: 50000 },
      { eixo: "faixa", chave: 5, rotulo: "mais de 60 dias", qtd: 60, valor: 40000 },
      { eixo: "faixa", chave: 1, rotulo: "1 a 7 dias", qtd: 10, valor: 2000 },
      { eixo: "faixa", chave: 3, rotulo: "16 a 30 dias", qtd: 30, valor: 8000 },
    ]);

    const r = await emAtrasoAte(TODAS, "2026-08-14");
    expect(r.porFaixa.map((f) => f.chave)).toEqual([1, 3, 5]);
    expect(r.porFaixa[0].rotulo).toBe("1 a 7 dias");
  });

  it("diz desde quando varreu — a tela precisa disso", async () => {
    responde([{ eixo: "total", chave: null, rotulo: null, qtd: 0, valor: 0 }]);
    const r = await emAtrasoAte(TODAS, "2026-08-14");
    // 180 dias antes de 14/08/2026.
    expect(r.desde).toBe("2026-02-15");
  });

  it("passa hoje como limite superior, exclusivo", async () => {
    responde([{ eixo: "total", chave: null, rotulo: null, qtd: 0, valor: 0 }]);
    await emAtrasoAte(TODAS, "2026-08-14");
    const params = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect(params[0]).toBe("2026-02-15");
    expect(params[1]).toBe("2026-08-14");
  });
});

describe("primeiraParcelaDe", () => {
  it("carrega os pagos na segunda métrica", async () => {
    responde([
      { eixo: "total", chave: null, rotulo: null, qtd: 40, pagos: 26, valor: 13000 },
      { eixo: "carteira", chave: 7, rotulo: "FESTCARD", qtd: 25, pagos: 20, valor: 9000 },
      { eixo: "carteira", chave: 9, rotulo: "OUTRA", qtd: 15, pagos: 6, valor: 4000 },
    ]);

    const r = await primeiraParcelaDe(TODAS, "2026-08-14");
    expect(r.avaliados).toBe(40);
    expect(r.pagos).toBe(26);
    // `valor` da fatia é a contagem de honradas, não dinheiro: é a tela que diz
    // o que a segunda métrica significa, como no acionamento.
    expect(r.porCarteira[0]).toMatchObject({ rotulo: "FESTCARD", qtd: 25, valor: 20 });
  });

  it("janela de 90 dias para trás", async () => {
    responde([{ eixo: "total", chave: null, rotulo: null, qtd: 0, pagos: 0, valor: 0 }]);
    await primeiraParcelaDe(TODAS, "2026-08-14");
    const params = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect(params[0]).toBe("2026-05-16");
    expect(params[1]).toBe("2026-08-14");
    // O SEXTO parâmetro é "hoje", que corta a parcela que ainda não venceu.
    // Era o quinto até a decisão 39: a operadora entrou como $5 e empurrou os
    // de trás. Trocar dois parâmetros posicionais de lugar não dá erro nenhum —
    // dá um relatório filtrado pela coluna errada.
    expect(params[5]).toBe("2026-08-14");
  });
});

describe("o recorte ocupa sempre $3, $4 e $5", () => {
  // A ordem posicional é a mesma nas sete consultas do relatório, e é a única
  // coisa que amarra `recorte()` ao SQL. Um teste por consulta, porque o preço
  // de errar é silencioso: filtrar carteira pela lista de equipes devolve zero
  // linhas, e zero linhas parece um dia fraco.
  const RECORTE = { carteiras: [7, 12], equipes: [30], operadoras: [260] };

  beforeEach(() =>
    responde([{ eixo: "total", chave: null, rotulo: null, qtd: 0, pagos: 0, valor: 0 }]),
  );

  it("a vencer", async () => {
    await aVencerEm({ inicio: "2026-08-14", fim: "2026-08-20", ...RECORTE }, "2026-08-14");
    const p = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect([p[2], p[3], p[4]]).toEqual([[7, 12], [30], [260]]);
  });

  it("em atraso", async () => {
    await emAtrasoAte(RECORTE, "2026-08-14");
    const p = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect([p[2], p[3], p[4]]).toEqual([[7, 12], [30], [260]]);
  });

  it("primeira parcela", async () => {
    await primeiraParcelaDe(RECORTE, "2026-08-14");
    const p = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect([p[2], p[3], p[4]]).toEqual([[7, 12], [30], [260]]);
  });

  it("sem recorte, os três são nulos — e a cláusula some da consulta", async () => {
    await emAtrasoAte(TODAS, "2026-08-14");
    const p = vi.mocked(consultaRelatorio).mock.calls[0][1];
    expect([p[2], p[3], p[4]]).toEqual([null, null, null]);
  });
});
