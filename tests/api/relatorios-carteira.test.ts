// As rotas da carteira de acordos — quem entra, e principalmente o que cada
// papel LEVA.
//
// Esta é a única tela do relatório em que três papéis chegam e recebem coisas
// diferentes, então o teste que importa não é o 200/403: é o que sobra no JSON.
// Um recorte por operadora vazando para a cobrança, ou um nome de devedor
// chegando ao supervisor, passaria despercebido numa conferência visual — a
// tela simplesmente não desenharia o bloco.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarUsuario, limparBanco, ler, requisicao } from "./ajuda";

vi.mock("@/lib/siscobra", () => ({
  configSiscobra: vi.fn(() => true),
}));
vi.mock("@/lib/relatorios-carteira", () => ({
  ATRASO_DIAS: 180,
  PRIMEIRA_PARCELA_DIAS: 90,
  QUEBRAS_DIAS: 30,
  aVencerEm: vi.fn(),
  emAtrasoAte: vi.fn(),
  quebrasDe: vi.fn(),
  primeiraParcelaDe: vi.fn(),
  listarParcelas: vi.fn(),
}));
vi.mock("@/lib/relatorios-cobranca", () => ({
  equipes: vi.fn(),
  carteiras: vi.fn(),
  operadoras: vi.fn(),
}));

import { configSiscobra } from "@/lib/siscobra";
import {
  aVencerEm,
  emAtrasoAte,
  listarParcelas,
  primeiraParcelaDe,
  quebrasDe,
} from "@/lib/relatorios-carteira";
import { GET } from "@/app/api/relatorios/carteira/route";
import { GET as GET_LISTA } from "@/app/api/relatorios/carteira/lista/route";

const OPERADORA = { chave: 260, rotulo: "YASMIN", qtd: 4, valor: 900 };

const A_VENCER = {
  qtd: 12,
  valor: 8400.5,
  hoje: { qtd: 3, valor: 1200 },
  amanha: { qtd: 2, valor: 800 },
  porDia: [{ chave: 0, rotulo: "14/08", qtd: 3, valor: 1200 }],
  porCarteira: [{ chave: 7, rotulo: "FESTCARD", qtd: 9, valor: 6000 }],
  porOperadora: [OPERADORA],
};
const ATRASO = {
  qtd: 40,
  valor: 31000,
  desde: "2026-02-15",
  porFaixa: [{ chave: 1, rotulo: "1 a 7 dias", qtd: 10, valor: 2000 }],
  porCarteira: [{ chave: 7, rotulo: "FESTCARD", qtd: 25, valor: 20000 }],
  porOperadora: [OPERADORA],
};
const QUEBRAS = {
  qtd: 3,
  valor: 5000,
  porCarteira: [{ chave: 7, rotulo: "FESTCARD", qtd: 3, valor: 5000 }],
  porOperadora: [OPERADORA],
};
const PRIMEIRA = {
  avaliados: 40,
  pagos: 26,
  valorPago: 13000,
  porCarteira: [{ chave: 7, rotulo: "FESTCARD", qtd: 25, valor: 20 }],
};
const PARCELAS = [
  {
    acocod: 555,
    devcod: 4242,
    parcela: 1,
    nome: "MARIA DA SILVA",
    cpf: "123.***.***-99",
    carteira: "FESTCARD",
    operadora: "YASMIN",
    valor: 320.5,
    vencimento: "2026-08-15",
    dias: 1,
  },
];

beforeEach(async () => {
  await limparBanco();
  vi.mocked(configSiscobra).mockReturnValue(true);
  // Cópias por chamada: a rota APAGA `porOperadora` do objeto que recebe, e um
  // mock compartilhado carregaria o apagamento para o teste seguinte.
  vi.mocked(aVencerEm).mockImplementation(async () => structuredClone(A_VENCER));
  vi.mocked(emAtrasoAte).mockImplementation(async () => structuredClone(ATRASO));
  vi.mocked(quebrasDe).mockImplementation(async () => structuredClone(QUEBRAS));
  vi.mocked(primeiraParcelaDe).mockImplementation(async () => structuredClone(PRIMEIRA));
  vi.mocked(listarParcelas).mockImplementation(async () => structuredClone(PARCELAS));
});

afterEach(() => vi.clearAllMocks());

type Papel = "ADMIN" | "SUPERVISOR" | "COBRANCA" | "OPERADOR";

async function pedir(url: string, papel?: Papel) {
  const usuario = papel
    ? await criarUsuario(`quem-${papel.toLowerCase()}`, papel)
    : undefined;
  return ler(await GET(await requisicao("GET", url, { usuario })));
}

async function pedirLista(url: string, papel?: Papel) {
  const usuario = papel
    ? await criarUsuario(`lista-${papel.toLowerCase()}`, papel)
    : undefined;
  return ler(await GET_LISTA(await requisicao("GET", url, { usuario })));
}

describe("quem alcança os agregados", () => {
  it("admin, supervisor e cobrança entram", async () => {
    for (const papel of ["ADMIN", "SUPERVISOR", "COBRANCA"] as const) {
      await limparBanco();
      const { status, corpo } = await pedir("/api/relatorios/carteira", papel);
      expect(status, papel).toBe(200);
      expect((corpo.aVencer as typeof A_VENCER).qtd, papel).toBe(12);
    }
  });

  it("o operador de helpdesk recebe 403", async () => {
    const { status } = await pedir("/api/relatorios/carteira", "OPERADOR");
    expect(status).toBe(403);
  });

  it("sem sessão é 401", async () => {
    const { status } = await pedir("/api/relatorios/carteira");
    expect(status).toBe(401);
  });

  it("o portão vem ANTES de qualquer consulta ao CRM", async () => {
    await pedir("/api/relatorios/carteira", "OPERADOR");
    expect(aVencerEm).not.toHaveBeenCalled();
    expect(emAtrasoAte).not.toHaveBeenCalled();
  });
});

describe("o recorte por operadora", () => {
  it("admin e supervisor recebem o ranking", async () => {
    for (const papel of ["ADMIN", "SUPERVISOR"] as const) {
      await limparBanco();
      const { corpo } = await pedir("/api/relatorios/carteira", papel);
      expect((corpo.aVencer as typeof A_VENCER).porOperadora, papel).toHaveLength(1);
      expect(corpo.podeVerOperadoras, papel).toBe(true);
    }
  });

  // A decisão 35 tirou a cobrança do relatório de produção porque ele é um
  // ranking nominal de colegas. A carteira por operadora é o mesmo ranking.
  it("a cobrança NÃO recebe — e o corte é no servidor, não na tela", async () => {
    const { corpo } = await pedir("/api/relatorios/carteira", "COBRANCA");
    expect(corpo.podeVerOperadoras).toBe(false);
    expect((corpo.aVencer as typeof A_VENCER).porOperadora).toEqual([]);
    expect((corpo.atraso as typeof ATRASO).porOperadora).toEqual([]);
    expect((corpo.quebras as typeof QUEBRAS).porOperadora).toEqual([]);
    // O nome não pode sobrar em canto nenhum do payload.
    expect(JSON.stringify(corpo)).not.toContain("YASMIN");
  });

  it("a cobrança continua vendo carteira, dia e faixa", async () => {
    const { corpo } = await pedir("/api/relatorios/carteira", "COBRANCA");
    expect((corpo.aVencer as typeof A_VENCER).porCarteira).toHaveLength(1);
    expect((corpo.aVencer as typeof A_VENCER).porDia).toHaveLength(1);
    expect((corpo.atraso as typeof ATRASO).porFaixa).toHaveLength(1);
  });
});

describe("a lista nominal", () => {
  it("admin e cobrança recebem os nomes", async () => {
    for (const papel of ["ADMIN", "COBRANCA"] as const) {
      await limparBanco();
      const { status, corpo } = await pedirLista(
        "/api/relatorios/carteira/lista",
        papel,
      );
      expect(status, papel).toBe(200);
      expect((corpo.parcelas as typeof PARCELAS)[0].nome, papel).toBe("MARIA DA SILVA");
    }
  });

  // O ponto da decisão 27: alcance sobre dado de devedor se decide pelo ofício,
  // não pela sala. O supervisor vê todos os agregados e nenhum nome.
  it("o SUPERVISOR recebe 403 — vê o agregado, nunca a lista", async () => {
    const { status } = await pedirLista("/api/relatorios/carteira/lista", "SUPERVISOR");
    expect(status).toBe(403);
  });

  it("o operador recebe 403", async () => {
    const { status } = await pedirLista("/api/relatorios/carteira/lista", "OPERADOR");
    expect(status).toBe(403);
  });

  it("sem sessão é 401 e o CRM não é consultado", async () => {
    const { status } = await pedirLista("/api/relatorios/carteira/lista");
    expect(status).toBe(401);
    expect(listarParcelas).not.toHaveBeenCalled();
  });

  it("passa um teto de linhas para a consulta", async () => {
    await pedirLista("/api/relatorios/carteira/lista", "ADMIN");
    const limite = vi.mocked(listarParcelas).mock.calls[0][2];
    expect(limite).toBeGreaterThan(0);
    expect(limite).toBeLessThanOrEqual(1000);
  });
});

describe("a janela pedida", () => {
  it("sem parâmetro, começa hoje e olha para frente", async () => {
    await pedir("/api/relatorios/carteira", "ADMIN");
    const f = vi.mocked(aVencerEm).mock.calls[0][0];
    expect(f.fim > f.inicio).toBe(true);
    expect(f.carteiras).toBeNull();
    expect(f.equipes).toBeNull();
    expect(f.operadoras).toBeNull();
  });

  it("carteira e equipe viram lista", async () => {
    await pedir("/api/relatorios/carteira?carteira=7&equipe=30", "ADMIN");
    const f = vi.mocked(aVencerEm).mock.calls[0][0];
    expect(f.carteiras).toEqual([7]);
    expect(f.equipes).toEqual([30]);
  });

  it("a lista por vírgula chega inteira nas quatro consultas", async () => {
    // As quatro precisam receber o MESMO recorte: divergir daria um painel com
    // dois filtros diferentes lado a lado, sem dizer.
    await pedir("/api/relatorios/carteira?carteira=7,12", "ADMIN");
    for (const fn of [aVencerEm, emAtrasoAte, quebrasDe, primeiraParcelaDe]) {
      expect(vi.mocked(fn).mock.calls[0][0].carteiras).toEqual([7, 12]);
    }
  });

  it("“todas” é o mesmo que não filtrar", async () => {
    await pedir("/api/relatorios/carteira?carteira=todas&equipe=todas", "ADMIN");
    const f = vi.mocked(aVencerEm).mock.calls[0][0];
    expect(f.carteiras).toBeNull();
    expect(f.equipes).toBeNull();
  });

  it("a cobrança não pode FILTRAR por operadora", async () => {
    // Sem esta trava ela reconstrói o ranking nominal que a decisão 36 lhe
    // nega — um pedido por operadora de cada vez. Esconder o seletor não basta:
    // a query string é editável.
    const { status } = await pedir(
      "/api/relatorios/carteira?operadora=260",
      "COBRANCA",
    );
    expect(status).toBe(403);
    expect(aVencerEm).not.toHaveBeenCalled();
  });

  it("admin e supervisor podem filtrar por operadora", async () => {
    for (const papel of ["ADMIN", "SUPERVISOR"] as const) {
      vi.clearAllMocks();
      const { status } = await pedir(
        "/api/relatorios/carteira?operadora=260",
        papel,
      );
      expect(status, papel).toBe(200);
      expect(vi.mocked(aVencerEm).mock.calls[0][0].operadoras, papel).toEqual([260]);
    }
  });

  it("recusa filtro que não é número", async () => {
    const { status } = await pedir("/api/relatorios/carteira?carteira=7;drop", "ADMIN");
    expect(status).toBe(400);
    expect(aVencerEm).not.toHaveBeenCalled();
  });

  it("recusa janela desconhecida", async () => {
    const { status } = await pedir("/api/relatorios/carteira?janela=sempre", "ADMIN");
    expect(status).toBe(400);
  });

  it("recusa data que não existe no calendário", async () => {
    const { status, corpo } = await pedir(
      "/api/relatorios/carteira?janela=personalizado&inicio=2026-02-31&fim=2026-03-05",
      "ADMIN",
    );
    expect(status).toBe(400);
    expect(String(corpo.erro)).toContain("calendário");
  });

  it("o atraso e as quebras não seguem a janela — são passado", async () => {
    // Mudar "próximos 7" para "próximos 60" não pode mexer no número de atraso:
    // um filtro que altera um número sem relação com ele é um painel que mente.
    await pedir("/api/relatorios/carteira?janela=prox60", "ADMIN");
    const atraso = vi.mocked(emAtrasoAte).mock.calls[0][0];
    expect(atraso).not.toHaveProperty("inicio");
    expect(atraso).not.toHaveProperty("fim");
  });
});

describe("quando o CRM não colabora", () => {
  it("sem configuração, 503 e não 500", async () => {
    vi.mocked(configSiscobra).mockReturnValue(false);
    const { status } = await pedir("/api/relatorios/carteira", "ADMIN");
    expect(status).toBe(503);
  });

  it("tempo esgotado vira 504 com instrução", async () => {
    vi.mocked(aVencerEm).mockRejectedValue(
      new Error("canceling statement due to statement timeout"),
    );
    const { status, corpo } = await pedir("/api/relatorios/carteira", "ADMIN");
    expect(status).toBe(504);
    expect(String(corpo.erro)).toContain("janela menor");
  });

  it("erro qualquer vira 502 sem vazar a mensagem do banco", async () => {
    vi.mocked(emAtrasoAte).mockRejectedValue(new Error('relation "boleto" does not exist'));
    const { status, corpo } = await pedir("/api/relatorios/carteira", "ADMIN");
    expect(status).toBe(502);
    expect(String(corpo.erro)).not.toContain("boleto");
  });
});
