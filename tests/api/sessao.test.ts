// O login visto de fora.
//
// O teste que dá nome a este arquivo é o do PAPEL NO COOKIE: a rota colapsava
// tudo que não era ADMIN em OPERADOR, e como o middleware roda no Edge (só tem o
// cookie), o supervisor era barrado na porta de toda tela de inventário. O papel
// existia no banco, funcionava na API e não funcionava para quem usava o
// sistema. Os testes de rota não pegaram porque forjam a sessão direto, sem
// passar por aqui — então o caminho do login precisa do seu próprio teste.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as entrar } from "@/app/api/sessao/route";
import { COOKIE_SESSAO, lerSessao } from "@/lib/sessao";
import { zerarTudo } from "@/lib/rate-limit";
import { criarUsuario, limparBanco, ler } from "./ajuda";

const SENHA = "senha-de-teste-123";

function login(corpo: unknown, ip = "10.0.0.1"): Request {
  return new Request("http://localhost/api/sessao", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo),
  });
}

/** Papel que ficou gravado no cookie assinado — o que o middleware vai ler. */
async function papelDoCookie(res: Response): Promise<string | undefined> {
  const cru = res.headers.get("set-cookie") ?? "";
  const token = cru
    .split(";")[0]
    ?.slice(`${COOKIE_SESSAO}=`.length);
  const sessao = await lerSessao(token);
  return sessao?.papel;
}

beforeAll(async () => {
  await limparBanco();
  await criarUsuario("chefe", "ADMIN");
  await criarUsuario("supervisora", "SUPERVISOR");
  await criarUsuario("operador", "OPERADOR");
  await criarUsuario("cobradora", "COBRANCA");
  await criarUsuario("afastado", "ADMIN", false);
});

beforeEach(() => {
  zerarTudo();
});

describe("papel gravado no cookie", () => {
  it("supervisor entra COMO supervisor (e não como operador)", async () => {
    const res = await entrar(login({ login: "supervisora", senha: SENHA }));
    expect(res.status).toBe(200);
    expect(await papelDoCookie(res)).toBe("SUPERVISOR");
  });

  it("admin entra como admin", async () => {
    const res = await entrar(login({ login: "chefe", senha: SENHA }));
    expect(await papelDoCookie(res)).toBe("ADMIN");
  });

  it("operador entra como operador", async () => {
    const res = await entrar(login({ login: "operador", senha: SENHA }));
    expect(await papelDoCookie(res)).toBe("OPERADOR");
  });

  // Mesmo risco da decisão 25, agora com um papel novo: se COBRANCA não
  // atravessasse inteiro até o cookie, a operadora logaria e seria expulsa do
  // /chat pelo middleware — que só tem o cookie para julgar.
  it("cobrança entra COMO cobrança", async () => {
    const res = await entrar(login({ login: "cobradora", senha: SENHA }));
    expect(res.status).toBe(200);
    expect(await papelDoCookie(res)).toBe("COBRANCA");
  });

  it("o corpo da resposta anuncia o mesmo papel do cookie", async () => {
    const { corpo } = await ler(
      await entrar(login({ login: "supervisora", senha: SENHA })),
    );
    expect((corpo.usuario as { papel: string }).papel).toBe("SUPERVISOR");
  });
});

describe("recusas", () => {
  it("senha errada e usuário inexistente dão a MESMA resposta", async () => {
    const a = await ler(await entrar(login({ login: "chefe", senha: "errada" })));
    const b = await ler(
      await entrar(login({ login: "ninguem", senha: "errada" }, "10.0.0.2")),
    );
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.corpo.erro).toBe(b.corpo.erro);
  });

  it("usuário inativo não entra nem com a senha certa", async () => {
    const res = await entrar(login({ login: "afastado", senha: SENHA }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("freio de força bruta", () => {
  it("bloqueia com 429 depois de 10 erros na mesma janela", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await entrar(login({ login: "chefe", senha: "errada" }));
      expect(res.status).toBe(401);
    }
    const res = await entrar(login({ login: "chefe", senha: "errada" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("a senha certa não passa enquanto o bloqueio está de pé", async () => {
    for (let i = 0; i < 11; i++) {
      await entrar(login({ login: "chefe", senha: "errada" }));
    }
    const res = await entrar(login({ login: "chefe", senha: SENHA }));
    expect(res.status).toBe(429);
  });

  it("o freio é por login: errar em um não tranca o outro", async () => {
    for (let i = 0; i < 11; i++) {
      await entrar(login({ login: "chefe", senha: "errada" }));
    }
    const res = await entrar(login({ login: "operador", senha: SENHA }));
    expect(res.status).toBe(200);
  });

  it("o freio é por IP: o vizinho no mesmo NAT não paga pelo errante", async () => {
    for (let i = 0; i < 11; i++) {
      await entrar(login({ login: "chefe", senha: "errada" }, "10.0.0.9"));
    }
    const res = await entrar(login({ login: "chefe", senha: SENHA }, "10.0.0.10"));
    expect(res.status).toBe(200);
  });

  it("acertar a senha limpa o histórico de erros", async () => {
    for (let i = 0; i < 9; i++) {
      await entrar(login({ login: "operador", senha: "errada" }));
    }
    expect((await entrar(login({ login: "operador", senha: SENHA }))).status).toBe(
      200,
    );
    // Se o contador não tivesse sido limpo, o 10º erro já bateria no teto.
    for (let i = 0; i < 9; i++) {
      const res = await entrar(login({ login: "operador", senha: "errada" }));
      expect(res.status).toBe(401);
    }
  });
});
