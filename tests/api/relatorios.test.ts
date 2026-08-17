// A rota do relatório de cobrança: quem entra, o que ela recusa e o que faz
// quando o CRM não colabora.
//
// O Siscobra é dublê aqui. O que se testa é a ROTA — portão, validação do
// período e tradução de erro; as consultas de verdade foram rodadas contra o
// banco real durante a construção (é a regra da casa: SQL que ninguém rodou é
// SQL que não funciona).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, limparBanco, ler, requisicao } from "./ajuda";

vi.mock("@/lib/siscobra", () => ({
  configSiscobra: vi.fn(() => true),
}));
vi.mock("@/lib/relatorios-cobranca", () => ({
  acordosDo: vi.fn(),
  acionamentosDe: vi.fn(),
  equipes: vi.fn(),
  carteiras: vi.fn(),
}));

import { configSiscobra } from "@/lib/siscobra";
import {
  acionamentosDe,
  acordosDo,
  carteiras,
  equipes,
} from "@/lib/relatorios-cobranca";
import { GET } from "@/app/api/relatorios/cobranca/route";
import { GET as GET_FILTROS } from "@/app/api/relatorios/cobranca/filtros/route";

const ACORDOS = {
  qtd: 97,
  valor: 340979.54,
  porOperadora: [{ chave: 260, rotulo: "YASMIN", qtd: 18, valor: 3285.21 }],
  porCarteira: [{ chave: 7, rotulo: "FESTCARD", qtd: 9, valor: 8004.56 }],
  porHora: [{ chave: 9, rotulo: "09h", qtd: 19, valor: 40000 }],
};
const ACIONAMENTOS = {
  qtd: 3052,
  devedores: 2470,
  porOperadora: [{ chave: 267, rotulo: "ANA JULIA", qtd: 340, valor: 334 }],
  porSituacao: [{ chave: null, rotulo: "RECADO", qtd: 774, valor: 700 }],
  porHora: [{ chave: 9, rotulo: "09h", qtd: 500, valor: 480 }],
};

beforeEach(async () => {
  await limparBanco();
  vi.mocked(configSiscobra).mockReturnValue(true);
  vi.mocked(acordosDo).mockResolvedValue(ACORDOS);
  vi.mocked(acionamentosDe).mockResolvedValue(ACIONAMENTOS);
  vi.mocked(equipes).mockResolvedValue([
    { cod: 30, nome: "EQUIPE AZUL", membros: 7 },
  ]);
  vi.mocked(carteiras).mockResolvedValue([{ cod: 7, nome: "FESTCARD" }]);
});

afterEach(() => vi.clearAllMocks());

async function pedir(url: string, papel?: "ADMIN" | "SUPERVISOR" | "COBRANCA" | "OPERADOR") {
  const usuario = papel
    ? await criarUsuario(`quem-${papel.toLowerCase()}`, papel)
    : undefined;
  return ler(await GET(await requisicao("GET", url, { usuario })));
}

describe("quem alcança o relatório", () => {
  it("admin e supervisor recebem os números", async () => {
    for (const papel of ["ADMIN", "SUPERVISOR"] as const) {
      await limparBanco();
      const { status, corpo } = await pedir("/api/relatorios/cobranca", papel);
      expect(status, papel).toBe(200);
      expect((corpo.acordos as typeof ACORDOS).qtd, papel).toBe(97);
    }
  });

  // Ela atende devedor; avaliar produção de equipe não é o ofício dela — e o
  // relatório é um ranking nominal das colegas.
  it("a operadora de cobrança recebe 403", async () => {
    const { status } = await pedir("/api/relatorios/cobranca", "COBRANCA");
    expect(status).toBe(403);
  });

  it("o operador de helpdesk recebe 403", async () => {
    const { status } = await pedir("/api/relatorios/cobranca", "OPERADOR");
    expect(status).toBe(403);
  });

  it("sem sessão é 401", async () => {
    const { status } = await pedir("/api/relatorios/cobranca");
    expect(status).toBe(401);
  });

  it("o portão vem ANTES de qualquer consulta ao CRM", async () => {
    await pedir("/api/relatorios/cobranca", "OPERADOR");
    expect(acordosDo).not.toHaveBeenCalled();
    expect(acionamentosDe).not.toHaveBeenCalled();
  });
});

describe("o período que chega na consulta", () => {
  it("sem parâmetro, é o dia de hoje — um dia só", async () => {
    await pedir("/api/relatorios/cobranca", "ADMIN");
    const f = vi.mocked(acordosDo).mock.calls[0][0];
    expect(f.inicio).toBe(f.fim);
    expect(f.carteira).toBeNull();
    expect(f.equipe).toBeNull();
  });

  it("carteira e equipe viram número", async () => {
    await pedir("/api/relatorios/cobranca?carteira=7&equipe=30", "ADMIN");
    const f = vi.mocked(acordosDo).mock.calls[0][0];
    expect(f.carteira).toBe(7);
    expect(f.equipe).toBe(30);
  });

  it("“todas” é o mesmo que não filtrar", async () => {
    await pedir("/api/relatorios/cobranca?carteira=todas&equipe=todas", "ADMIN");
    const f = vi.mocked(acordosDo).mock.calls[0][0];
    expect(f.carteira).toBeNull();
    expect(f.equipe).toBeNull();
  });

  it("acordos e acionamentos recebem EXATAMENTE o mesmo recorte", async () => {
    // Se divergissem, a tela mostraria dois períodos lado a lado sem dizer.
    await pedir(
      "/api/relatorios/cobranca?periodo=personalizado&inicio=2026-07-01&fim=2026-07-31&equipe=30",
      "ADMIN",
    );
    expect(vi.mocked(acordosDo).mock.calls[0][0]).toEqual(
      vi.mocked(acionamentosDe).mock.calls[0][0],
    );
  });

  it("filtro que não é número é recusado, sem consultar", async () => {
    const { status } = await pedir(
      "/api/relatorios/cobranca?carteira=7;DROP",
      "ADMIN",
    );
    expect(status).toBe(400);
    expect(acordosDo).not.toHaveBeenCalled();
  });

  it("data inexistente no calendário é recusada", async () => {
    const { status, corpo } = await pedir(
      "/api/relatorios/cobranca?periodo=personalizado&inicio=2026-02-31&fim=2026-03-01",
      "ADMIN",
    );
    expect(status).toBe(400);
    expect(String(corpo.erro)).toMatch(/calendário/);
    expect(acordosDo).not.toHaveBeenCalled();
  });

  it("intervalo grande demais é recusado antes de tocar no CRM", async () => {
    const { status } = await pedir(
      "/api/relatorios/cobranca?periodo=personalizado&inicio=2020-01-01&fim=2026-08-13",
      "ADMIN",
    );
    expect(status).toBe(400);
    expect(acionamentosDe).not.toHaveBeenCalled();
  });
});

describe("quando o CRM não colabora", () => {
  it("sem configuração, 503 — e a mensagem diz o que falta", async () => {
    vi.mocked(configSiscobra).mockReturnValue(false);
    const { status, corpo } = await pedir("/api/relatorios/cobranca", "ADMIN");
    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/DB_HOST/);
  });

  it("consulta estourando o prazo vira 504 com saída sugerida", async () => {
    vi.mocked(acordosDo).mockRejectedValue(
      new Error("canceling statement due to statement timeout"),
    );
    const { status, corpo } = await pedir("/api/relatorios/cobranca", "ADMIN");
    expect(status).toBe(504);
    expect(String(corpo.erro)).toMatch(/período menor|equipe/);
  });

  it("qualquer outra falha do banco vira 502, sem vazar a mensagem do pg", async () => {
    vi.mocked(acordosDo).mockRejectedValue(
      new Error('relation "acordo" does not exist'),
    );
    const { status, corpo } = await pedir("/api/relatorios/cobranca", "ADMIN");
    expect(status).toBe(502);
    expect(String(corpo.erro)).not.toMatch(/relation/);
  });
});

describe("as listas dos seletores", () => {
  it("chegam para o supervisor", async () => {
    const usuario = await criarUsuario("sup-filtros", "SUPERVISOR");
    const { status, corpo } = await ler(
      await GET_FILTROS(
        await requisicao("GET", "/api/relatorios/cobranca/filtros", { usuario }),
      ),
    );
    expect(status).toBe(200);
    expect(corpo.equipes).toHaveLength(1);
    expect(corpo.carteiras).toHaveLength(1);
  });

  it("têm o mesmo portão do relatório", async () => {
    const usuario = await criarUsuario("cob-filtros", "COBRANCA");
    const { status } = await ler(
      await GET_FILTROS(
        await requisicao("GET", "/api/relatorios/cobranca/filtros", { usuario }),
      ),
    );
    expect(status).toBe(403);
  });
});
