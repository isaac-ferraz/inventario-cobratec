import { describe, expect, it } from "vitest";
import {
  alcancaCelular,
  alcancaChamado,
  alcancaComputador,
  alcancaFuncionario,
  alcancaSala,
  filtroChamado,
  filtroComputador,
  filtroSala,
  podeMover,
  temEscopo,
  type Escopo,
} from "./supervisao";

const admin: Escopo = { id: "u-admin", papel: "ADMIN", salaIds: [] };
const operador: Escopo = { id: "u-op", papel: "OPERADOR", salaIds: [] };
// Responde por duas salas — o caso que prova que o escopo não é de uma só.
const sup: Escopo = { id: "u-sup", papel: "SUPERVISOR", salaIds: ["s1", "s2"] };
const supSemSala: Escopo = { id: "u-novo", papel: "SUPERVISOR", salaIds: [] };

describe("alcance de sala", () => {
  it("admin alcança qualquer sala", () => {
    expect(alcancaSala(admin, "s9")).toBe(true);
    expect(alcancaSala(admin, null)).toBe(true);
  });

  it("supervisor alcança as suas e mais nenhuma", () => {
    expect(alcancaSala(sup, "s1")).toBe(true);
    expect(alcancaSala(sup, "s2")).toBe(true);
    expect(alcancaSala(sup, "s3")).toBe(false);
  });

  it("sala nula não é de ninguém além do admin", () => {
    expect(alcancaSala(sup, null)).toBe(false);
    expect(alcancaSala(sup, undefined)).toBe(false);
  });

  it("operador não alcança sala nenhuma", () => {
    expect(alcancaSala(operador, "s1")).toBe(false);
  });

  // Papel sem sala atribuída é "supervisor de nada", não "supervisor de tudo".
  it("supervisor sem sala não tem escopo", () => {
    expect(temEscopo(supSemSala)).toBe(false);
    expect(alcancaSala(supSemSala, "s1")).toBe(false);
  });
});

describe("computador", () => {
  it("alcança pela sala da máquina", () => {
    expect(alcancaComputador(sup, { salaId: "s1", funcionario: null })).toBe(true);
  });

  // O caso que mais importa: a máquina está registrada em outro lugar (ou em
  // lugar nenhum), mas quem usa senta na sala do supervisor.
  it("alcança pelo dono, mesmo com a sala da máquina desencontrada", () => {
    expect(
      alcancaComputador(sup, { salaId: "s9", funcionario: { salaId: "s1" } }),
    ).toBe(true);
    expect(
      alcancaComputador(sup, { salaId: null, funcionario: { salaId: "s2" } }),
    ).toBe(true);
  });

  it("máquina de estoque sem sala não é de ninguém", () => {
    expect(alcancaComputador(sup, { salaId: null, funcionario: null })).toBe(false);
  });

  it("máquina de outra sala com dono de outra sala fica de fora", () => {
    expect(
      alcancaComputador(sup, { salaId: "s9", funcionario: { salaId: "s8" } }),
    ).toBe(false);
  });
});

describe("celular", () => {
  // Celular não tem sala: anda com a pessoa.
  it("segue o dono", () => {
    expect(alcancaCelular(sup, { funcionario: { salaId: "s1" } })).toBe(true);
    expect(alcancaCelular(sup, { funcionario: { salaId: "s9" } })).toBe(false);
  });

  it("aparelho em estoque é do TI", () => {
    expect(alcancaCelular(sup, { funcionario: null })).toBe(false);
    expect(alcancaCelular(admin, { funcionario: null })).toBe(true);
  });
});

describe("funcionário", () => {
  it("alcança quem senta nas salas dele", () => {
    expect(alcancaFuncionario(sup, { salaId: "s2" })).toBe(true);
    expect(alcancaFuncionario(sup, { salaId: "s3" })).toBe(false);
    expect(alcancaFuncionario(sup, { salaId: null })).toBe(false);
  });
});

describe("chamado", () => {
  it("alcança os da sala dele", () => {
    expect(alcancaChamado(sup, { salaId: "s1", solicitanteId: "outro" })).toBe(true);
  });

  it("alcança os que ele mesmo abriu, mesmo fora das salas dele", () => {
    expect(alcancaChamado(sup, { salaId: "s9", solicitanteId: "u-sup" })).toBe(true);
    expect(alcancaChamado(sup, { salaId: null, solicitanteId: "u-sup" })).toBe(true);
  });

  it("não alcança chamado alheio de outra sala", () => {
    expect(alcancaChamado(sup, { salaId: "s9", solicitanteId: "outro" })).toBe(false);
  });

  it("operador só alcança os próprios", () => {
    expect(alcancaChamado(operador, { salaId: "s1", solicitanteId: "u-op" })).toBe(true);
    expect(alcancaChamado(operador, { salaId: "s1", solicitanteId: "x" })).toBe(false);
  });
});

describe("mover equipamento", () => {
  it("admin move para onde quiser", () => {
    expect(podeMover(admin, "s1", "s9")).toBe(true);
    expect(podeMover(admin, null, null)).toBe(true);
  });

  it("supervisor move entre as salas dele", () => {
    expect(podeMover(sup, "s1", "s2")).toBe(true);
  });

  // Sem esta trava, ele empurraria a máquina para fora e perderia o próprio
  // equipamento de vista sem ninguém ter decidido isso.
  it("não move para fora do escopo", () => {
    expect(podeMover(sup, "s1", "s9")).toBe(false);
    expect(podeMover(sup, "s1", null)).toBe(false);
  });

  it("não traz de fora do escopo", () => {
    expect(podeMover(sup, "s9", "s1")).toBe(false);
    expect(podeMover(sup, null, "s1")).toBe(false);
  });

  it("operador não move nada", () => {
    expect(podeMover(operador, "s1", "s2")).toBe(false);
  });
});

describe("filtros do Prisma", () => {
  it("admin não restringe nada", () => {
    expect(filtroComputador(admin)).toBeUndefined();
    expect(filtroSala(admin)).toBeUndefined();
    expect(filtroChamado(admin)).toBeUndefined();
  });

  it("supervisor filtra por máquina na sala OU dono na sala", () => {
    expect(filtroComputador(sup)).toEqual({
      OR: [
        { salaId: { in: ["s1", "s2"] } },
        { funcionario: { salaId: { in: ["s1", "s2"] } } },
      ],
    });
  });

  // A garantia de que "sem sala" não vira "tudo": o filtro precisa NÃO casar
  // com nada, e não sumir.
  it("supervisor sem sala recebe filtro que não casa com nada", () => {
    const f = filtroComputador(supSemSala);
    expect(f).toBeDefined();
    expect(f).toEqual({ id: { in: [] } });
  });

  it("operador só vê os próprios chamados", () => {
    expect(filtroChamado(operador)).toEqual({ solicitanteId: "u-op" });
  });

  it("supervisor sem sala ainda vê os chamados que abriu", () => {
    expect(filtroChamado(supSemSala)).toEqual({ solicitanteId: "u-novo" });
  });
});
