import { describe, expect, it } from "vitest";
import {
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  lerPaginacao,
  montarPagina,
} from "./paginacao";

function params(q: string): URLSearchParams {
  return new URLSearchParams(q);
}

describe("lerPaginacao", () => {
  it("sem parâmetros usa o padrão", () => {
    expect(lerPaginacao(params(""))).toEqual({
      limite: LIMITE_PADRAO,
      pagina: 1,
      pular: 0,
    });
  });

  it("calcula o pulo a partir da página", () => {
    expect(lerPaginacao(params("pagina=3&limite=20"))).toEqual({
      limite: 20,
      pagina: 3,
      pular: 40,
    });
  });

  it("prende o limite no teto", () => {
    expect(lerPaginacao(params("limite=99999")).limite).toBe(LIMITE_MAXIMO);
  });

  // Lixo na query string não pode derrubar a lista.
  it.each(["", "limite=abc", "limite=0", "limite=-5", "limite=1.9e400"])(
    "entrada inválida (%s) cai no limite padrão",
    (q) => {
      expect(lerPaginacao(params(q)).limite).toBe(LIMITE_PADRAO);
    },
  );

  it.each(["pagina=abc", "pagina=0", "pagina=-3"])(
    "página inválida (%s) vira a primeira",
    (q) => {
      const p = lerPaginacao(params(q));
      expect(p.pagina).toBe(1);
      expect(p.pular).toBe(0);
    },
  );

  it("página fracionária é truncada", () => {
    expect(lerPaginacao(params("pagina=2.7&limite=10")).pagina).toBe(2);
  });
});

describe("montarPagina", () => {
  const p = { limite: 10, pagina: 1, pular: 0 };

  it("avisa que há mais quando a página enche e sobra total", () => {
    const r = montarPagina(Array(10).fill("x"), 25, p);
    expect(r.temMais).toBe(true);
    expect(r.total).toBe(25);
  });

  it("não avisa quando a página fecha o total", () => {
    expect(montarPagina(Array(10).fill("x"), 10, p).temMais).toBe(false);
  });

  it("na última página, temMais é falso", () => {
    const ultima = { limite: 10, pagina: 3, pular: 20 };
    expect(montarPagina(Array(5).fill("x"), 25, ultima).temMais).toBe(false);
  });

  it("lista vazia não promete mais nada", () => {
    expect(montarPagina([], 0, p).temMais).toBe(false);
  });
});
