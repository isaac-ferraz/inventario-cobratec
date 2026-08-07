import { describe, expect, it } from "vitest";
import {
  PENDENCIAS,
  acharPendencia,
  contarPendencias,
  type Verificavel,
} from "./pendencias";

// Máquina com tudo registrado — o ponto de partida de cada caso.
const completo: Verificavel = {
  salaId: "sala-1",
  licencaWindows: "XXXXX-XXXXX",
  licencaMicrosoft: "M365 Business",
  contaOutlook: "ana@cobratec.com.br",
  loginPadrao: "COB-042",
  temHeadset: true,
};

describe("catálogo", () => {
  it("as chaves são únicas (viram parâmetro de URL)", () => {
    const chaves = PENDENCIAS.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("máquina completa não tem pendência nenhuma", () => {
    expect(PENDENCIAS.filter((p) => p.falta(completo))).toHaveLength(0);
  });

  it("máquina vazia tem todas", () => {
    const vazia: Verificavel = {
      salaId: null,
      licencaWindows: null,
      licencaMicrosoft: null,
      contaOutlook: null,
      loginPadrao: null,
      temHeadset: false,
    };
    expect(PENDENCIAS.filter((p) => p.falta(vazia))).toHaveLength(
      PENDENCIAS.length,
    );
  });

  // Campo salvo em branco é o mesmo que ausente para quem confere a máquina.
  it.each(["", "   "])("texto em branco (%s) conta como faltando", (v) => {
    const p = acharPendencia("sem-licenca-windows")!;
    expect(p.falta({ ...completo, licencaWindows: v })).toBe(true);
  });

  it("headset presente não é pendência", () => {
    const p = acharPendencia("sem-headset")!;
    expect(p.falta({ temHeadset: true })).toBe(false);
    expect(p.falta({ temHeadset: false })).toBe(true);
  });

  it("chave desconhecida não acha nada", () => {
    expect(acharPendencia("sem-cafe")).toBeUndefined();
    expect(acharPendencia(null)).toBeUndefined();
  });
});

describe("contarPendencias", () => {
  // Este é o teste que importa: o número do card do Dashboard tem que ser
  // exatamente o tamanho da lista que o clique abre.
  it("a contagem bate com o filtro correspondente", () => {
    const parque: Verificavel[] = [
      completo,
      { ...completo, licencaWindows: null },
      { ...completo, licencaWindows: "", temHeadset: false },
      { ...completo, salaId: null },
    ];

    const contagem = contarPendencias(parque);
    for (const linha of contagem) {
      const filtrados = parque.filter(acharPendencia(linha.chave)!.falta);
      expect(filtrados).toHaveLength(linha.valor);
    }

    expect(contagem.find((c) => c.chave === "sem-licenca-windows")?.valor).toBe(2);
    expect(contagem.find((c) => c.chave === "sem-headset")?.valor).toBe(1);
    expect(contagem.find((c) => c.chave === "sem-sala")?.valor).toBe(1);
  });

  it("parque vazio zera tudo sem quebrar", () => {
    expect(contarPendencias([]).every((c) => c.valor === 0)).toBe(true);
  });
});
