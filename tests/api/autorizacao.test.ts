// A porta de entrada de cada rota: quem não está logado não passa (401) e o
// operador não alcança o que é do administrador (403).
//
// Estes testes existem porque o middleware NÃO é a fronteira de segurança — ele
// é um portão de navegação. Se alguém mexer no matcher do middleware e esquecer
// uma rota, é aqui que o furo aparece.
import { beforeAll, describe, expect, it } from "vitest";
import { GET as getComputadores } from "@/app/api/computadores/route";
import { POST as postComputadores } from "@/app/api/computadores/route";
import { GET as getFuncionarios } from "@/app/api/funcionarios/route";
import { GET as getUsuarios } from "@/app/api/usuarios/route";
import { GET as getAuditoria } from "@/app/api/auditoria/route";
import { GET as getCelulares } from "@/app/api/celulares/route";
import { GET as getChamados } from "@/app/api/chamados/route";
import {
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;
let operador: UsuarioTeste;
let inativo: UsuarioTeste;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("admin-auth", "ADMIN");
  operador = await criarUsuario("operador-auth", "OPERADOR");
  inativo = await criarUsuario("desligado-auth", "ADMIN", false);
});

// Cada entrada: nome da rota e o handler já pronto para receber o Request.
const SO_ADMIN = [
  ["GET /api/computadores", getComputadores],
  ["GET /api/funcionarios", getFuncionarios],
  ["GET /api/usuarios", getUsuarios],
  ["GET /api/auditoria", getAuditoria],
  ["GET /api/celulares", getCelulares],
] as const;

describe("sem sessão", () => {
  it.each(SO_ADMIN)("%s responde 401", async (_nome, handler) => {
    const res = await handler(await requisicao("GET", "/api/x"));
    expect(res.status).toBe(401);
  });

  it("rota compartilhada (chamados) também exige login", async () => {
    const res = await getChamados(await requisicao("GET", "/api/chamados"));
    expect(res.status).toBe(401);
  });

  it("cookie forjado não vale", async () => {
    const res = await getComputadores(
      await requisicao("GET", "/api/computadores", {
        cookie: "sessao=payload-inventado.assinatura-inventada",
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("operador em rota de administrador", () => {
  it.each(SO_ADMIN)("%s responde 403", async (_nome, handler) => {
    const res = await handler(
      await requisicao("GET", "/api/x", { usuario: operador }),
    );
    expect(res.status).toBe(403);
  });

  it("escrita também é barrada", async () => {
    const res = await postComputadores(
      await requisicao("POST", "/api/computadores", {
        usuario: operador,
        corpo: { identificador: "PC-DO-OPERADOR" },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("revogação", () => {
  // O cookie continua criptograficamente válido depois do desligamento — quem
  // corta o acesso é a reconferência no banco.
  it("usuário inativado perde o acesso mesmo com cookie válido", async () => {
    const res = await getComputadores(
      await requisicao("GET", "/api/computadores", { usuario: inativo }),
    );
    expect(res.status).toBe(401);
  });
});

describe("administrador", () => {
  it("passa e recebe a lista", async () => {
    const { status, corpo } = await ler(
      await getComputadores(
        await requisicao("GET", "/api/computadores", { usuario: admin }),
      ),
    );
    expect(status).toBe(200);
    expect(Array.isArray(corpo)).toBe(true);
  });
});
