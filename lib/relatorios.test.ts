// O período de um relatório — a parte que erra em silêncio.
//
// Não há banco aqui de propósito: o que se testa é aritmética de data e fuso,
// que é onde o painel mente sem quebrar. Um relatório com a data errada não dá
// erro nenhum — ele mostra um número, e o número está errado.
import { describe, expect, it } from "vitest";
import {
  MAX_DIAS,
  diasDoIntervalo,
  diasNoIntervalo,
  formatarDiaBr,
  hojeNoBrasil,
  resolverJanela,
  resolverPeriodo,
  rotuloPeriodo,
  somarDias,
} from "@/lib/relatorios";

describe("hojeNoBrasil", () => {
  it("usa o fuso do Brasil, não o do servidor", () => {
    // 14/08 às 01:00 UTC ainda é 13/08 às 22h em São Paulo. É o caso real: o
    // container sobe em UTC, e às 22h o gestor ainda está olhando o dia dele.
    expect(hojeNoBrasil(new Date("2026-08-14T01:00:00Z"))).toBe("2026-08-13");
  });

  it("vira o dia às 3h UTC (meia-noite em São Paulo)", () => {
    expect(hojeNoBrasil(new Date("2026-08-14T02:59:00Z"))).toBe("2026-08-13");
    expect(hojeNoBrasil(new Date("2026-08-14T03:01:00Z"))).toBe("2026-08-14");
  });
});

describe("somarDias", () => {
  it("atravessa mês e ano", () => {
    expect(somarDias("2026-08-13", -1)).toBe("2026-08-12");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("acerta o 29 de fevereiro de ano bissexto", () => {
    expect(somarDias("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("diasNoIntervalo", () => {
  it("conta as duas pontas", () => {
    expect(diasNoIntervalo("2026-08-13", "2026-08-13")).toBe(1);
    expect(diasNoIntervalo("2026-08-01", "2026-08-13")).toBe(13);
  });

  it("não perde um dia no horário de verão", () => {
    // O Brasil não tem mais horário de verão, mas a conta é feita ao meio-dia
    // UTC justamente para não depender disso: com 00:00, um fuso que pula uma
    // hora arredondaria para menos.
    expect(diasNoIntervalo("2026-10-01", "2026-11-30")).toBe(61);
  });
});

const HOJE = "2026-08-13"; // uma quinta-feira

describe("resolverPeriodo — atalhos", () => {
  it("hoje é um dia só", () => {
    expect(resolverPeriodo({ periodo: "hoje" }, HOJE)).toEqual({
      ok: true,
      inicio: HOJE,
      fim: HOJE,
    });
  });

  it("ontem não inclui hoje", () => {
    expect(resolverPeriodo({ periodo: "ontem" }, HOJE)).toEqual({
      ok: true,
      inicio: "2026-08-12",
      fim: "2026-08-12",
    });
  });

  it("“últimos 7 dias” inclui hoje e soma 7", () => {
    const r = resolverPeriodo({ periodo: "7d" }, HOJE);
    expect(r).toEqual({ ok: true, inicio: "2026-08-07", fim: HOJE });
    if (r.ok) expect(diasNoIntervalo(r.inicio, r.fim)).toBe(7);
  });

  it("o mês atual começa no dia 1º", () => {
    expect(resolverPeriodo({ periodo: "mes" }, HOJE)).toEqual({
      ok: true,
      inicio: "2026-08-01",
      fim: HOJE,
    });
  });

  it("sem período escolhido, o padrão é hoje", () => {
    expect(resolverPeriodo({}, HOJE)).toEqual({ ok: true, inicio: HOJE, fim: HOJE });
  });

  it("recusa período que não existe", () => {
    const r = resolverPeriodo({ periodo: "semana-do-chefe" }, HOJE);
    expect(r.ok).toBe(false);
  });
});

describe("resolverPeriodo — datas escolhidas à mão", () => {
  it("aceita um intervalo válido", () => {
    expect(
      resolverPeriodo(
        { periodo: "personalizado", inicio: "2026-07-01", fim: "2026-07-31" },
        HOJE,
      ),
    ).toEqual({ ok: true, inicio: "2026-07-01", fim: "2026-07-31" });
  });

  it("cobra as duas datas", () => {
    const r = resolverPeriodo(
      { periodo: "personalizado", inicio: "2026-07-01" },
      HOJE,
    );
    expect(r.ok).toBe(false);
  });

  it("recusa data que não existe no calendário", () => {
    // O mesmo par que já derrubou o cadastro de equipamento (decisão 25):
    // "2026-02-31" passa na regex e o JS o empurra calado para 03/03.
    for (const ruim of ["2026-02-31", "2026-13-01"]) {
      const r = resolverPeriodo(
        { periodo: "personalizado", inicio: ruim, fim: "2026-08-01" },
        HOJE,
      );
      expect(r.ok, ruim).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/calendário/);
    }
  });

  it("recusa formato fora de AAAA-MM-DD", () => {
    const r = resolverPeriodo(
      { periodo: "personalizado", inicio: "01/07/2026", fim: "2026-07-31" },
      HOJE,
    );
    expect(r.ok).toBe(false);
  });

  it("recusa início depois do fim", () => {
    const r = resolverPeriodo(
      { periodo: "personalizado", inicio: "2026-08-13", fim: "2026-08-01" },
      HOJE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/depois/);
  });

  it("recusa intervalo maior que o teto — o CRM é produção", () => {
    const fim = "2026-08-13";
    const inicio = somarDias(fim, -MAX_DIAS); // um dia além do permitido
    const r = resolverPeriodo({ periodo: "personalizado", inicio, fim }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(new RegExp(String(MAX_DIAS)));
  });

  it("aceita exatamente o teto", () => {
    const fim = "2026-08-13";
    const inicio = somarDias(fim, -(MAX_DIAS - 1));
    expect(resolverPeriodo({ periodo: "personalizado", inicio, fim }, HOJE).ok).toBe(
      true,
    );
  });
});

describe("rótulos", () => {
  it("escreve a data como o Brasil lê", () => {
    expect(formatarDiaBr("2026-08-13")).toBe("13/08/2026");
  });

  it("diz “hoje” e “ontem” em vez de repetir a data seca", () => {
    expect(rotuloPeriodo(HOJE, HOJE, HOJE)).toBe("hoje, 13/08/2026");
    expect(rotuloPeriodo("2026-08-12", "2026-08-12", HOJE)).toBe(
      "ontem, 12/08/2026",
    );
    expect(rotuloPeriodo("2026-08-01", HOJE, HOJE)).toBe(
      "01/08/2026 a 13/08/2026",
    );
  });
});

// ─────────────────── a janela que olha para frente (carteira) ───────────────────

describe("resolverJanela", () => {
  it("o padrão são os próximos 15 dias, começando hoje", () => {
    const r = resolverJanela({}, "2026-08-14");
    expect(r).toEqual({ ok: true, inicio: "2026-08-14", fim: "2026-08-28" });
  });

  it("inclui HOJE na ponta de baixo", () => {
    // Parcela que vence hoje ainda é cobrável hoje. Começar amanhã esvaziaria o
    // painel justamente no dia em que ele mais serve.
    for (const chave of ["prox7", "prox15", "prox30", "prox60"]) {
      const r = resolverJanela({ janela: chave }, "2026-08-14");
      expect(r.ok && r.inicio, chave).toBe("2026-08-14");
    }
  });

  it("prox7 são sete dias contando hoje, não oito", () => {
    const r = resolverJanela({ janela: "prox7" }, "2026-08-14");
    expect(r.ok && diasNoIntervalo(r.inicio, r.fim)).toBe(7);
  });

  it("recusa janela desconhecida", () => {
    const r = resolverJanela({ janela: "sempre" }, "2026-08-14");
    expect(r.ok).toBe(false);
  });

  it("aceita datas futuras no personalizado", () => {
    // É a diferença central para `resolverPeriodo`: lá o futuro não faz sentido,
    // aqui é o assunto.
    const r = resolverJanela(
      { janela: "personalizado", inicio: "2026-09-01", fim: "2026-09-30" },
      "2026-08-14",
    );
    expect(r).toEqual({ ok: true, inicio: "2026-09-01", fim: "2026-09-30" });
  });

  it("recusa data que não existe no calendário", () => {
    const r = resolverJanela(
      { janela: "personalizado", inicio: "2026-02-31", fim: "2026-03-05" },
      "2026-08-14",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain("calendário");
  });

  it("recusa intervalo invertido", () => {
    const r = resolverJanela(
      { janela: "personalizado", inicio: "2026-09-30", fim: "2026-09-01" },
      "2026-08-14",
    );
    expect(r.ok).toBe(false);
  });

  it("respeita o teto de MAX_DIAS", () => {
    const r = resolverJanela(
      { janela: "personalizado", inicio: "2026-08-14", fim: somarDias("2026-08-14", MAX_DIAS) },
      "2026-08-14",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain(String(MAX_DIAS));
  });
});

describe("diasDoIntervalo", () => {
  it("devolve os dias em ordem, com as duas pontas", () => {
    expect(diasDoIntervalo("2026-08-14", "2026-08-17")).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  it("um dia só é uma lista de um", () => {
    expect(diasDoIntervalo("2026-08-14", "2026-08-14")).toEqual(["2026-08-14"]);
  });

  it("atravessa a virada do mês", () => {
    expect(diasDoIntervalo("2026-08-30", "2026-09-01")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
    ]);
  });

  it("intervalo invertido é lista vazia, não laço infinito", () => {
    expect(diasDoIntervalo("2026-08-17", "2026-08-14")).toEqual([]);
  });
});
