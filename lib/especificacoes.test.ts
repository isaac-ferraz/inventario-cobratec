import { describe, it, expect } from "vitest";
import { serializar, desserializar, expandirComponente } from "@/lib/especificacoes";

describe("serializar", () => {
  it("retorna null para null, undefined ou objeto vazio", () => {
    expect(serializar(null)).toBeNull();
    expect(serializar(undefined)).toBeNull();
    expect(serializar({})).toBeNull();
  });

  it("serializa um objeto para JSON em texto", () => {
    expect(serializar({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });
});

describe("desserializar", () => {
  it("retorna null para texto vazio, nulo ou JSON inválido", () => {
    expect(desserializar(null)).toBeNull();
    expect(desserializar("")).toBeNull();
    expect(desserializar("{não json")).toBeNull();
  });

  it("desserializa JSON de objeto", () => {
    expect(desserializar('{"a":1}')).toEqual({ a: 1 });
  });

  it("retorna null quando o JSON não é um objeto (ex: número)", () => {
    expect(desserializar("42")).toBeNull();
  });
});

describe("round-trip", () => {
  it("serializar → desserializar preserva o objeto", () => {
    const esp = { capacidadeGB: 8, tecnologia: "DDR4" };
    expect(desserializar(serializar(esp))).toEqual(esp);
  });

  it("expandirComponente substitui a string por objeto", () => {
    const comp = { id: "1", especificacoes: '{"a":1}' };
    expect(expandirComponente(comp).especificacoes).toEqual({ a: 1 });
  });
});
