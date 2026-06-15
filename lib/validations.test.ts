import { describe, it, expect } from "vitest";
import {
  computadorSchema,
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
