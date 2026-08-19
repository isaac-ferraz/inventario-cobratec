// O filtro do Dashboard — e a regra que, se escorregar, vira escalada de acesso.
//
// O supervisor de sala chega com um recorte imposto pelo servidor. Se o filtro
// escolhido compusesse por OR em vez de AND, `?sala=<outra sala>` na barra de
// endereços ampliaria o alcance dele. Não é um bug de conveniência: é a decisão
// 24 sendo desfeita por uma query string.
import { describe, expect, it } from "vitest";
import {
  comFiltro,
  comoQuery,
  lerFiltroDashboard,
  ondeCelularFiltrado,
  ondeChamadoFiltrado,
  ondeComputadorFiltrado,
  temFiltro,
} from "@/lib/dashboard-filtros";

/** O que `filtroComputador` devolve para um supervisor com uma sala. */
const ESCOPO_SUPERVISOR = {
  OR: [{ salaId: { in: ["s1"] } }, { funcionario: { salaId: { in: ["s1"] } } }],
};

describe("lerFiltroDashboard", () => {
  it("sem parâmetro, sem filtro", () => {
    const f = lerFiltroDashboard({});
    expect(f).toEqual({ cargos: [], salas: [], situacoes: [] });
    expect(temFiltro(f)).toBe(false);
  });

  it("lê listas por vírgula", () => {
    const f = lerFiltroDashboard({ cargo: "Operadora,Gestor", sala: "s1" });
    expect(f.cargos).toEqual(["Operadora", "Gestor"]);
    expect(f.salas).toEqual(["s1"]);
  });

  it("descarta os rótulos de “todos”", () => {
    // Um link antigo pode trazer `?sala=todos`; ele significa "sem filtro", não
    // uma sala chamada "todos".
    expect(lerFiltroDashboard({ sala: "todos" }).salas).toEqual([]);
    expect(lerFiltroDashboard({ situacao: "todas" }).situacoes).toEqual([]);
  });

  it("aceita o parâmetro repetido do Next (?sala=a&sala=b)", () => {
    expect(lerFiltroDashboard({ sala: ["s1", "s2"] }).salas).toEqual(["s1", "s2"]);
  });
});

describe("ondeComputadorFiltrado — o escopo é TETO", () => {
  it("admin sem filtro não restringe nada", () => {
    expect(ondeComputadorFiltrado(undefined, lerFiltroDashboard({}))).toEqual({});
  });

  it("supervisor sem filtro leva só o escopo dele", () => {
    const onde = ondeComputadorFiltrado(ESCOPO_SUPERVISOR, lerFiltroDashboard({}));
    expect(onde).toEqual({ AND: [ESCOPO_SUPERVISOR] });
  });

  it("escolha COMPÕE com o escopo por AND, nunca o substitui", () => {
    // O teste que vale o arquivo: o escopo continua na cláusula depois de a
    // pessoa escolher uma sala. Com OR — ou substituindo —, pedir a sala 9
    // devolveria a sala 9.
    const onde = ondeComputadorFiltrado(
      ESCOPO_SUPERVISOR,
      lerFiltroDashboard({ sala: "s9" }),
    ) as { AND: unknown[] };
    expect(onde.AND).toHaveLength(2);
    expect(onde.AND[0]).toEqual(ESCOPO_SUPERVISOR);
    expect(onde.AND[1]).toEqual({ salaId: { in: ["s9"] } });
    // O Prisma resolve a interseção: s1 E s9 é vazio. É a resposta certa.
  });

  it("“sem sala” vira salaId nulo, não um id chamado “sem”", () => {
    const onde = ondeComputadorFiltrado(
      undefined,
      lerFiltroDashboard({ sala: "sem" }),
    ) as { AND: unknown[] };
    expect(onde.AND[0]).toEqual({ salaId: null });
  });

  it("“sem sala” convive com uma sala escolhida", () => {
    const onde = ondeComputadorFiltrado(
      undefined,
      lerFiltroDashboard({ sala: "sem,s1" }),
    ) as { AND: [{ OR: unknown[] }] };
    expect(onde.AND[0].OR).toEqual([{ salaId: { in: ["s1"] } }, { salaId: null }]);
  });

  it("cargo e situação entram como cláusulas próprias", () => {
    const onde = ondeComputadorFiltrado(
      undefined,
      lerFiltroDashboard({ cargo: "Operadora", situacao: "ativo,reserva" }),
    ) as { AND: unknown[] };
    expect(onde.AND).toContainEqual({ funcionario: { cargo: { in: ["Operadora"] } } });
    expect(onde.AND).toContainEqual({ situacao: { in: ["ativo", "reserva"] } });
  });
});

describe("ondeCelularFiltrado — a sala é a do dono", () => {
  it("filtra pelo funcionário, não pelo aparelho", () => {
    const onde = ondeCelularFiltrado(
      undefined,
      lerFiltroDashboard({ sala: "s1" }),
    ) as { AND: unknown[] };
    expect(onde.AND[0]).toEqual({ funcionario: { salaId: { in: ["s1"] } } });
  });

  it("“sem sala” inclui o aparelho em estoque", () => {
    // O celular anda com a pessoa (decisão 15): sem dono é, necessariamente,
    // sem sala. Deixá-lo de fora esconderia o estoque do recorte.
    const onde = ondeCelularFiltrado(
      undefined,
      lerFiltroDashboard({ sala: "sem" }),
    ) as { AND: [{ OR: unknown[] }] };
    expect(onde.AND[0].OR).toContainEqual({ funcionario: { salaId: null } });
    expect(onde.AND[0].OR).toContainEqual({ funcionarioId: null });
  });
});

describe("ondeChamadoFiltrado", () => {
  it("aceita sala e ignora cargo e situação", () => {
    // Chamado não tem cargo nem situação de ativo; aplicar os dois devolveria
    // zero chamados sempre que alguém filtrasse por cargo.
    const onde = ondeChamadoFiltrado(
      undefined,
      lerFiltroDashboard({ sala: "s1", cargo: "Operadora", situacao: "ativo" }),
    ) as { AND: unknown[] };
    expect(onde.AND).toEqual([{ salaId: { in: ["s1"] } }]);
  });
});

describe("o filtro viaja nos links do painel", () => {
  it("vira query string", () => {
    const f = lerFiltroDashboard({ sala: "s1,s2", cargo: "Gestor" });
    expect(comoQuery(f)).toBe("cargo=Gestor&sala=s1%2Cs2");
  });

  it("junta a um link que já tem parâmetro", () => {
    // Sem isto, "Sem licença Windows: 7" com a Sala 93 filtrada abriria a lista
    // com os sete da EMPRESA — card e lista discordando.
    const f = lerFiltroDashboard({ sala: "s1" });
    expect(comFiltro("/computadores?pendencia=windows", f)).toBe(
      "/computadores?pendencia=windows&sala=s1",
    );
  });

  it("sem filtro, o link fica como estava", () => {
    expect(comFiltro("/computadores?funcionario=sem", lerFiltroDashboard({}))).toBe(
      "/computadores?funcionario=sem",
    );
  });
});
