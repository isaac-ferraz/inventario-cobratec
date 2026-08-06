import { describe, it, expect } from "vitest";
import {
  contaNoParque,
  estadoGarantia,
  diasAteGarantia,
  estaEmManutencao,
  situacaoAoAbrirManutencao,
  situacaoAoConcluirManutencao,
  somarCustos,
  formatarMoeda,
  DIAS_AVISO_GARANTIA,
} from "./ativos";

const HOJE = new Date("2026-08-06T12:00:00Z");
const emDias = (d: number) =>
  new Date(HOJE.getTime() + d * 24 * 60 * 60 * 1000);

describe("parque", () => {
  it("descartado sai da conta; o resto fica", () => {
    expect(contaNoParque("descartado")).toBe(false);
    for (const s of ["ativo", "manutencao", "reserva"]) {
      expect(contaNoParque(s)).toBe(true);
    }
  });
});

describe("estado da garantia", () => {
  it("sem data é 'sem' (e não 'vencida')", () => {
    expect(estadoGarantia(null, HOJE)).toBe("sem");
    expect(estadoGarantia(undefined, HOJE)).toBe("sem");
    expect(estadoGarantia("data-invalida", HOJE)).toBe("sem");
  });

  it("data passada vence", () => {
    expect(estadoGarantia(emDias(-1), HOJE)).toBe("vencida");
    expect(estadoGarantia(emDias(-400), HOJE)).toBe("vencida");
  });

  it("dentro da janela de aviso é 'vencendo'", () => {
    expect(estadoGarantia(emDias(1), HOJE)).toBe("vencendo");
    expect(estadoGarantia(emDias(DIAS_AVISO_GARANTIA), HOJE)).toBe("vencendo");
  });

  it("depois da janela é 'vigente'", () => {
    expect(estadoGarantia(emDias(DIAS_AVISO_GARANTIA + 1), HOJE)).toBe("vigente");
    expect(estadoGarantia(emDias(365), HOJE)).toBe("vigente");
  });

  it("conta os dias restantes", () => {
    expect(diasAteGarantia(emDias(30), HOJE)).toBe(30);
    expect(diasAteGarantia(emDias(-5), HOJE)).toBe(-5);
  });
});

describe("manutenção em aberto", () => {
  it("sem data de conclusão = ainda no conserto", () => {
    expect(estaEmManutencao(null)).toBe(true);
    expect(estaEmManutencao(new Date())).toBe(false);
  });
});

describe("efeito da manutenção sobre a situação", () => {
  it("abrir manda para 'manutencao'", () => {
    expect(situacaoAoAbrirManutencao("ativo")).toBe("manutencao");
    expect(situacaoAoAbrirManutencao("reserva")).toBe("manutencao");
  });

  it("não ressuscita equipamento descartado", () => {
    expect(situacaoAoAbrirManutencao("descartado")).toBeNull();
  });

  it("concluir devolve para 'ativo'", () => {
    expect(situacaoAoConcluirManutencao("manutencao")).toBe("ativo");
  });

  it("concluir não desfaz decisão tomada durante o conserto", () => {
    // Se durante o conserto alguém marcou descartado (não valeu a pena) ou
    // reserva, concluir a manutenção não pode reverter isso.
    expect(situacaoAoConcluirManutencao("descartado")).toBeNull();
    expect(situacaoAoConcluirManutencao("reserva")).toBeNull();
    expect(situacaoAoConcluirManutencao("ativo")).toBeNull();
  });
});

describe("custos", () => {
  it("soma ignorando os sem valor", () => {
    expect(
      somarCustos([{ custo: 150.5 }, { custo: null }, { custo: 49.5 }, {}] as {
        custo?: number | null;
      }[]),
    ).toBe(200);
  });

  it("lista vazia custa zero", () => {
    expect(somarCustos([])).toBe(0);
  });

  it("formata em real, com travessão para vazio", () => {
    expect(formatarMoeda(null)).toBe("—");
    expect(formatarMoeda(1234.5)).toContain("1.234,50");
  });
});
