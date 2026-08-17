// O relógio — a parte que decide se está na hora.
//
// Sem banco e sem tempo real: `deveRodar` e `agoraNoBrasil` recebem o instante
// como argumento justamente para isso. Um agendador que erra o horário não dá
// erro nenhum — ele simplesmente não roda, ou roda na hora errada, e as duas
// coisas só aparecem no dia seguinte.
import { describe, expect, it } from "vitest";
import { JANELA_MINUTOS, agoraNoBrasil, deveRodar } from "@/lib/agendador";

const MEIO_DIA = { hora: 12, minuto: 0 };

describe("agoraNoBrasil", () => {
  it("converte de UTC para o fuso do Brasil", () => {
    // 14/08 às 01:00 UTC ainda é 13/08 às 22h em São Paulo. É o caso real: o
    // container sobe em UTC, e um agendador que lesse o relógio do processo
    // rodaria o "fechamento do dia" no dia seguinte.
    const r = agoraNoBrasil(new Date("2026-08-14T01:00:00Z"));
    expect(r.dia).toBe("2026-08-13");
    expect(r.hora).toBe(22);
    expect(r.minuto).toBe(0);
  });

  it("devolve 0 e não 24 na meia-noite", () => {
    // `hour12: false` produz "24" em algumas implementações de Intl, e 24 * 60
    // faria a comparação de horário passar longe de qualquer tarefa.
    const r = agoraNoBrasil(new Date("2026-08-14T03:00:00Z")); // 00h em SP
    expect(r.hora).toBe(0);
    expect(r.dia).toBe("2026-08-14");
  });
});

describe("deveRodar", () => {
  it("roda quando chega a hora", () => {
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-14", hora: 12, minuto: 0 }, null),
    ).toBe(true);
  });

  it("não roda antes da hora", () => {
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-14", hora: 11, minuto: 59 }, null),
    ).toBe(false);
  });

  it("não roda duas vezes no mesmo dia", () => {
    // O caso que motivou gravar o dia no banco: um restart do container às
    // 12h05 mandaria o digest do meio-dia de novo.
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-14", hora: 12, minuto: 5 }, "2026-08-14"),
    ).toBe(false);
  });

  it("roda de novo no dia seguinte", () => {
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-15", hora: 12, minuto: 1 }, "2026-08-14"),
    ).toBe(true);
  });

  it("recupera o horário perdido dentro da janela", () => {
    // Faltou luz das 11h às 13h: o digest do meio-dia ainda vale às 13h.
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-14", hora: 13, minuto: 30 }, null),
    ).toBe(true);
  });

  it("desiste depois da janela", () => {
    // "Produção parcial do dia" chegando às 19h não é informação atrasada, é
    // informação errada.
    expect(
      deveRodar(MEIO_DIA, { dia: "2026-08-14", hora: 19, minuto: 0 }, null),
    ).toBe(false);
  });

  it("a borda da janela ainda conta", () => {
    const borda = 12 * 60 + JANELA_MINUTOS;
    expect(
      deveRodar(
        MEIO_DIA,
        { dia: "2026-08-14", hora: Math.floor(borda / 60), minuto: borda % 60 },
        null,
      ),
    ).toBe(true);
  });

  it("tarefa da madrugada não é confundida com a da noite anterior", () => {
    // A purga é às 3h. Às 23h de ontem o atraso daria negativo — e negativo tem
    // que ser "ainda não", nunca "já passou".
    expect(
      deveRodar({ hora: 3, minuto: 0 }, { dia: "2026-08-14", hora: 23, minuto: 0 }, null),
    ).toBe(false);
  });
});
