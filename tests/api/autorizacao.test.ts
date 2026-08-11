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
import { exigirChat } from "@/lib/autorizacao";
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
let cobranca: UsuarioTeste;
let supervisor: UsuarioTeste;
let cobrancaInativa: UsuarioTeste;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("admin-auth", "ADMIN");
  operador = await criarUsuario("operador-auth", "OPERADOR");
  inativo = await criarUsuario("desligado-auth", "ADMIN", false);
  cobranca = await criarUsuario("cobranca-auth", "COBRANCA");
  supervisor = await criarUsuario("supervisor-auth", "SUPERVISOR");
  cobrancaInativa = await criarUsuario("cobranca-fora", "COBRANCA", false);
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

// exigirChat é o portão das conversas com devedor. As rotas de /api/chat ainda
// não existem (chegam na fase 2), mas o portão sim — e testá-lo agora é o que
// garante que elas nasçam fechadas para quem não é do ofício, em vez de
// dependerem do middleware, que não é fronteira de segurança.
describe("exigirChat", () => {
  async function tentar(usuario?: UsuarioTeste) {
    const r = await exigirChat(
      await requisicao("GET", "/api/chat/conversas", { usuario }),
    );
    return "resposta" in r ? r.resposta.status : 200;
  }

  it("admin e cobrança passam", async () => {
    expect(await tentar(admin)).toBe(200);
    expect(await tentar(cobranca)).toBe(200);
  });

  it("supervisor de sala é barrado — cobrança não é assunto de sala", async () => {
    expect(await tentar(supervisor)).toBe(403);
  });

  it("operador de helpdesk é barrado", async () => {
    expect(await tentar(operador)).toBe(403);
  });

  it("sem sessão é 401, não 403", async () => {
    expect(await tentar()).toBe(401);
  });

  // Mesma revogação das outras rotas: o cookie segue válido, quem corta é a
  // reconferência no banco. Vale dobrado aqui, onde o dado é de terceiro.
  it("cobrança inativada perde o acesso mesmo com cookie válido", async () => {
    expect(await tentar(cobrancaInativa)).toBe(401);
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
