// O freio de tentativas, com o tempo injetado (nada de esperar de verdade).
import { beforeEach, describe, expect, it } from "vitest";
import {
  limparTentativas,
  podarJanelas,
  registrarTentativa,
  zerarTudo,
} from "@/lib/rate-limit";

const MAX = 3;
const JANELA = 60_000;

beforeEach(() => {
  zerarTudo();
});

describe("registrarTentativa", () => {
  it("libera até o máximo e barra a seguinte", () => {
    for (let i = 1; i <= MAX; i++) {
      expect(registrarTentativa("a", MAX, JANELA, 1000).permitido, `${i}`).toBe(
        true,
      );
    }
    expect(registrarTentativa("a", MAX, JANELA, 1000).permitido).toBe(false);
  });

  it("diz quantos segundos faltam para a janela virar", () => {
    for (let i = 0; i <= MAX; i++) registrarTentativa("a", MAX, JANELA, 1000);
    const v = registrarTentativa("a", MAX, JANELA, 1000 + 20_000);
    expect(v.permitido).toBe(false);
    expect(v.esperarS).toBe(40);
  });

  it("a janela vira e o contador recomeça", () => {
    for (let i = 0; i <= MAX; i++) registrarTentativa("a", MAX, JANELA, 1000);
    expect(registrarTentativa("a", MAX, JANELA, 1000).permitido).toBe(false);
    expect(registrarTentativa("a", MAX, JANELA, 1000 + JANELA).permitido).toBe(
      true,
    );
  });

  it("chaves diferentes não se atrapalham", () => {
    for (let i = 0; i <= MAX; i++) registrarTentativa("a", MAX, JANELA, 1000);
    expect(registrarTentativa("b", MAX, JANELA, 1000).permitido).toBe(true);
  });
});

describe("limpeza", () => {
  it("limparTentativas devolve o direito de tentar", () => {
    for (let i = 0; i <= MAX; i++) registrarTentativa("a", MAX, JANELA, 1000);
    limparTentativas("a");
    expect(registrarTentativa("a", MAX, JANELA, 1000).permitido).toBe(true);
  });

  it("podarJanelas descarta as vencidas e preserva as vivas", () => {
    registrarTentativa("velha", MAX, JANELA, 1000);
    registrarTentativa("nova", MAX, JANELA, 1000 + JANELA);
    podarJanelas(JANELA, 1000 + JANELA + 1);

    // "velha" foi podada: recomeça do zero e aceita o máximo inteiro.
    for (let i = 1; i <= MAX; i++) {
      expect(
        registrarTentativa("velha", MAX, JANELA, 1000 + JANELA + 1).permitido,
      ).toBe(true);
    }
    // "nova" seguiu contando: já tinha 1, então sobram MAX-1.
    for (let i = 1; i <= MAX - 1; i++) {
      expect(
        registrarTentativa("nova", MAX, JANELA, 1000 + JANELA + 1).permitido,
      ).toBe(true);
    }
    expect(
      registrarTentativa("nova", MAX, JANELA, 1000 + JANELA + 1).permitido,
    ).toBe(false);
  });
});
