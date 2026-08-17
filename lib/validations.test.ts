import { describe, it, expect } from "vitest";
import {
  computadorSchema,
  celularSchema,
  itemDepositoSchema,
  funcionarioSchema,
  componenteSchema,
} from "@/lib/validations";

describe("computadorSchema", () => {
  it("aceita o mínimo (só identificador) e normaliza opcional vazio para null", () => {
    const r = computadorSchema.parse({ identificador: "PAT-1", apelido: "" });
    expect(r.identificador).toBe("PAT-1");
    expect(r.apelido).toBeNull();
  });

  it("faz trim e exige identificador não-vazio", () => {
    expect(() => computadorSchema.parse({ identificador: "   " })).toThrow();
  });

  it("valida o e-mail da conta Outlook quando preenchida", () => {
    expect(() =>
      computadorSchema.parse({
        identificador: "PAT-1",
        contaOutlook: "naoehemail",
      }),
    ).toThrow(/e-mail/i);

    const ok = computadorSchema.parse({
      identificador: "PAT-1",
      contaOutlook: "ana@cobratec.com.br",
    });
    expect(ok.contaOutlook).toBe("ana@cobratec.com.br");
  });

  it("conta Outlook vazia vira null (permite limpar pela edição)", () => {
    const r = computadorSchema.parse({
      identificador: "PAT-1",
      contaOutlook: "",
    });
    expect(r.contaOutlook).toBeNull();
  });

  it("rejeita identificador acima do limite de tamanho", () => {
    expect(() =>
      computadorSchema.parse({ identificador: "x".repeat(201) }),
    ).toThrow();
  });

  it("preserva os periféricos como boolean quando enviados", () => {
    const r = computadorSchema.parse({
      identificador: "PAT-1",
      temMouse: false,
      temHeadset: true,
    });
    expect(r.temMouse).toBe(false);
    expect(r.temHeadset).toBe(true);
  });
});

describe("celularSchema", () => {
  it("aceita o mínimo (só identificador) e normaliza opcional vazio para null", () => {
    const r = celularSchema.parse({ identificador: "CEL-1", numero: "" });
    expect(r.identificador).toBe("CEL-1");
    expect(r.numero).toBeNull();
  });

  it("faz trim e exige identificador não-vazio", () => {
    expect(() => celularSchema.parse({ identificador: "   " })).toThrow();
  });

  it("preserva os campos de telefonia quando preenchidos", () => {
    const r = celularSchema.parse({
      identificador: "CEL-1",
      operadora: "Vivo",
      imei: "356938035643809",
    });
    expect(r.operadora).toBe("Vivo");
    expect(r.imei).toBe("356938035643809");
  });

  it("rejeita identificador acima do limite de tamanho", () => {
    expect(() =>
      celularSchema.parse({ identificador: "x".repeat(201) }),
    ).toThrow();
  });
});

describe("itemDepositoSchema", () => {
  it("exige nome e aceita o mínimo", () => {
    expect(() => itemDepositoSchema.parse({ nome: "" })).toThrow();
    const r = itemDepositoSchema.parse({ nome: "Cabo HDMI" });
    expect(r.nome).toBe("Cabo HDMI");
  });

  it("aceita quantidade como número ou string numérica (coerção)", () => {
    const a = itemDepositoSchema.parse({ nome: "Mouse", quantidade: 5 });
    expect(a.quantidade).toBe(5);
    const b = itemDepositoSchema.parse({ nome: "Mouse", quantidade: "5" });
    expect(b.quantidade).toBe(5);
  });

  it("rejeita quantidade negativa e não-inteira", () => {
    expect(() =>
      itemDepositoSchema.parse({ nome: "Cabo", quantidade: -1 }),
    ).toThrow();
    expect(() =>
      itemDepositoSchema.parse({ nome: "Cabo", quantidade: 1.5 }),
    ).toThrow();
  });

  it("categoria vazia vira null (permite limpar pela edição)", () => {
    const r = itemDepositoSchema.parse({ nome: "Cabo", categoria: "" });
    expect(r.categoria).toBeNull();
  });
});

describe("funcionarioSchema", () => {
  it("exige nome e cargo", () => {
    expect(() => funcionarioSchema.parse({ nome: "", cargo: "" })).toThrow();
  });

  it("aceita um funcionário válido", () => {
    const r = funcionarioSchema.parse({ nome: "Ana", cargo: "Operadora" });
    expect(r.nome).toBe("Ana");
  });
});

describe("componenteSchema", () => {
  it("limita especificacoes a 50 campos", () => {
    const muitos: Record<string, number> = {};
    for (let i = 0; i < 51; i++) muitos["k" + i] = i;
    expect(() =>
      componenteSchema.parse({
        computadorId: "c1",
        tipoId: "t1",
        descricao: "x",
        especificacoes: muitos,
      }),
    ).toThrow(/50/);
  });

  it("aceita especificacoes dentro do limite", () => {
    const r = componenteSchema.parse({
      computadorId: "c1",
      tipoId: "t1",
      descricao: "Kingston 8GB",
      especificacoes: { capacidadeGB: 8 },
    });
    expect(r.especificacoes).toEqual({ capacidadeGB: 8 });
  });
});

// Datas do ciclo de vida (aquisição, garantia, manutenção).
//
// A validação antiga olhava só o FORMATO, e o JS tem duas maneiras ruins de
// tratar uma data que não existe: "2026-13-01" vira Invalid Date (a rota
// respondia 500) e "2026-02-31" ROLA para 03/03 — gravava calado um dia que
// ninguém digitou. As duas coisas são erro de entrada e devem dar 400.
describe("datas do ciclo de vida", () => {
  it("aceita data real e fixa ao meio-dia UTC", () => {
    const r = computadorSchema.parse({
      identificador: "PAT-1",
      dataAquisicao: "2026-08-06",
    });
    expect(r.dataAquisicao?.toISOString()).toBe("2026-08-06T12:00:00.000Z");
  });

  it("recusa 31 de fevereiro em vez de rolar para março", () => {
    const r = computadorSchema.safeParse({
      identificador: "PAT-1",
      garantiaAte: "2026-02-31",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.errors[0].message).toMatch(/inexistente no calendário/i);
    }
  });

  it("recusa mês 13 em vez de estourar erro interno", () => {
    expect(
      computadorSchema.safeParse({
        identificador: "PAT-1",
        dataAquisicao: "2026-13-01",
      }).success,
    ).toBe(false);
  });

  it("recusa 0000-00-00 e dia 00", () => {
    for (const data of ["0000-00-00", "2026-08-00", "2026-00-10"]) {
      expect(
        computadorSchema.safeParse({ identificador: "PAT-1", dataAquisicao: data })
          .success,
        data,
      ).toBe(false);
    }
  });

  it("recusa o que não é AAAA-MM-DD", () => {
    for (const data of ["06/08/2026", "2026-8-6", "ontem", "2026-08-06T10:00"]) {
      expect(
        computadorSchema.safeParse({ identificador: "PAT-1", dataAquisicao: data })
          .success,
        data,
      ).toBe(false);
    }
  });

  it("29 de fevereiro passa em ano bissexto e falha fora dele", () => {
    expect(
      computadorSchema.safeParse({
        identificador: "PAT-1",
        dataAquisicao: "2028-02-29",
      }).success,
    ).toBe(true);
    expect(
      computadorSchema.safeParse({
        identificador: "PAT-1",
        dataAquisicao: "2026-02-29",
      }).success,
    ).toBe(false);
  });

  it('"" limpa a data e ausente não mexe no campo', () => {
    const limpa = computadorSchema.parse({
      identificador: "PAT-1",
      garantiaAte: "",
    });
    expect(limpa.garantiaAte).toBeNull();
    const ausente = computadorSchema.parse({ identificador: "PAT-1" });
    expect(ausente.garantiaAte).toBeUndefined();
  });

  it("vale igual para o celular", () => {
    expect(
      celularSchema.safeParse({
        identificador: "CEL-1",
        garantiaAte: "2026-02-31",
      }).success,
    ).toBe(false);
  });
});
