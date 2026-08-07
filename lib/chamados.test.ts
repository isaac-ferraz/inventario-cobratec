import { describe, it, expect } from "vitest";
import {
  filtrarMensagens,
  podeMudarStatus,
  camposProibidos,
  calcularResolvidoEm,
  estaEmAberto,
} from "./chamados";

// A visibilidade do chamado mudou de casa: agora é `alcancaChamado`, em
// lib/supervisao.test.ts, junto com a dos computadores e das pessoas — quem
// enxerga o quê passou a ser uma pergunta só, com os três papéis.

describe("nota interna", () => {
  const mensagens = [
    { id: "1", interna: false },
    { id: "2", interna: true },
    { id: "3", interna: false },
  ];

  it("some por completo para o operador", () => {
    const vistas = filtrarMensagens("OPERADOR", mensagens);
    expect(vistas.map((m) => m.id)).toEqual(["1", "3"]);
    expect(vistas.some((m) => m.interna)).toBe(false);
  });

  it("aparece inteira para o admin", () => {
    expect(filtrarMensagens("ADMIN", mensagens)).toHaveLength(3);
  });
});

describe("transições de status", () => {
  it("admin conduz o chamado livremente", () => {
    for (const novo of ["em_andamento", "aguardando", "resolvido", "fechado", "aberto"]) {
      expect(podeMudarStatus("ADMIN", "aberto", novo).permitido).toBe(true);
    }
  });

  it("operador fecha o próprio chamado quando resolvido", () => {
    expect(podeMudarStatus("OPERADOR", "resolvido", "fechado").permitido).toBe(true);
  });

  it("operador reabre se o problema voltou", () => {
    expect(podeMudarStatus("OPERADOR", "resolvido", "aberto").permitido).toBe(true);
    expect(podeMudarStatus("OPERADOR", "fechado", "aberto").permitido).toBe(true);
  });

  it("operador NÃO gerencia a fila do TI", () => {
    for (const [de, para] of [
      ["aberto", "em_andamento"],
      ["aberto", "resolvido"],
      ["em_andamento", "resolvido"],
      ["aguardando", "fechado"],
    ]) {
      const r = podeMudarStatus("OPERADOR", de, para);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.motivo).toBeTruthy();
    }
  });

  it("recusa status inexistente, venha de quem vier", () => {
    expect(podeMudarStatus("ADMIN", "aberto", "cancelado").permitido).toBe(false);
    expect(podeMudarStatus("OPERADOR", "aberto", "").permitido).toBe(false);
  });

  it("manter o mesmo status é sempre permitido (PATCH parcial)", () => {
    expect(podeMudarStatus("OPERADOR", "aberto", "aberto").permitido).toBe(true);
  });
});

describe("campos exclusivos do admin", () => {
  it("bloqueia prioridade, responsável e categoria para o operador", () => {
    expect(
      camposProibidos("OPERADOR", { prioridade: "urgente", corpo: "x" }),
    ).toEqual(["prioridade"]);
    expect(
      camposProibidos("OPERADOR", { responsavelId: "u2", categoria: "Rede" }),
    ).toEqual(["responsavelId", "categoria"]);
  });

  it("não bloqueia nada para o admin", () => {
    expect(camposProibidos("ADMIN", { prioridade: "alta" })).toEqual([]);
  });

  it("não reclama do que o operador pode mandar", () => {
    expect(camposProibidos("OPERADOR", { status: "fechado" })).toEqual([]);
  });
});

describe("marcação de resolvido", () => {
  const agora = new Date("2026-08-06T12:00:00Z");
  const antes = new Date("2026-08-01T09:00:00Z");

  it("marca ao resolver", () => {
    expect(calcularResolvidoEm("resolvido", null, agora)).toEqual(agora);
  });

  it("preserva a data original ao fechar depois de resolvido", () => {
    expect(calcularResolvidoEm("fechado", antes, agora)).toEqual(antes);
  });

  it("limpa ao reabrir, senão a métrica de tempo mente", () => {
    expect(calcularResolvidoEm("aberto", antes, agora)).toBeNull();
    expect(calcularResolvidoEm("em_andamento", antes, agora)).toBeNull();
  });
});

describe("em aberto", () => {
  it("conta o que ainda pede ação do TI", () => {
    expect(["aberto", "em_andamento", "aguardando"].every(estaEmAberto)).toBe(true);
    expect(["resolvido", "fechado"].some(estaEmAberto)).toBe(false);
  });
});
