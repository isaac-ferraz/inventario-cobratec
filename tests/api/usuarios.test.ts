// Travas que impedem o TI de se trancar para fora do próprio sistema.
//
// Sem elas, um clique errado ("inativar") no último administrador deixaria o
// sistema sem ninguém capaz de criar usuários — e o único conserto seria mexer
// no banco na mão.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH as editar, DELETE as remover } from "@/app/api/usuarios/[id]/route";
import { POST as criar } from "@/app/api/usuarios/route";
import {
  criarUsuario,
  limparBanco,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("unico-admin", "ADMIN");
});

describe("último administrador ativo", () => {
  it("não pode ser rebaixado a operador", async () => {
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { papel: "OPERADOR" },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);

    const depois = await prisma.usuario.findUnique({
      where: { id: admin.id },
      select: { papel: true },
    });
    expect(depois?.papel).toBe("ADMIN");
  });

  it("não pode ser inativado", async () => {
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { ativo: false },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);
  });

  it("não pode ser removido", async () => {
    const res = await remover(
      await requisicao("DELETE", `/api/usuarios/${admin.id}`, {
        usuario: admin,
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.usuario.count({ where: { id: admin.id } })).toBe(1);
  });

  it("com um segundo administrador ativo, o rebaixamento passa", async () => {
    const outro = await criarUsuario("segundo-admin", "ADMIN");
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: outro,
        corpo: { papel: "OPERADOR" },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(200);
  });

  it("um administrador INATIVO não conta como sucessor", async () => {
    await criarUsuario("admin-desligado", "ADMIN", false);
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { ativo: false },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);
  });
});

describe("operador", () => {
  it("não mexe em usuários", async () => {
    const op = await criarUsuario("operador-comum", "OPERADOR");
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${op.id}`, {
        usuario: op,
        corpo: { papel: "ADMIN" },
      }),
      { params: { id: op.id } },
    );
    expect(res.status).toBe(403);
  });
});

// Diferente das travas acima: aqui o sistema NÃO fica sem administrador, porque
// existe outro. O que se protege é a pessoa que está agindo AGORA — inativar a
// própria conta derrubava a sessão no instante seguinte (o papel e o `ativo` são
// reconferidos no banco a cada requisição), e o caminho era um clique em "Conta
// ativa" no próprio usuário, sem aviso nenhum.
describe("a própria conta, havendo outro admin", () => {
  it("não pode se inativar", async () => {
    await criarUsuario("outro-admin", "ADMIN");
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { ativo: false },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);
    const eu = await prisma.usuario.findUnique({
      where: { id: admin.id },
      select: { ativo: true },
    });
    expect(eu?.ativo).toBe(true);
  });

  it("não pode se rebaixar", async () => {
    await criarUsuario("outro-admin", "ADMIN");
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { papel: "SUPERVISOR" },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);
    const eu = await prisma.usuario.findUnique({
      where: { id: admin.id },
      select: { papel: true },
    });
    expect(eu?.papel).toBe("ADMIN");
  });

  it("mas OUTRO administrador pode inativá-la", async () => {
    const outro = await criarUsuario("outro-admin", "ADMIN");
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: outro,
        corpo: { ativo: false },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(200);
  });

  it("e editar o próprio nome continua funcionando", async () => {
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { nome: "Chefe do TI" },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(200);
  });
});

// O código da operadora no Siscobra é o que liga uma conversa do /chat ao
// trabalho de quem a atendeu. Ele anda colado ao papel COBRANCA de propósito:
// preso a um papel que não atende devedor, viraria uma atribuição adormecida,
// pronta para voltar a valer sozinha numa promoção futura — a mesma armadilha
// que as salas do supervisor já resolvem zerando o vínculo.
describe("código do Siscobra (siscobraUsucod)", () => {
  async function novo(corpo: Record<string, unknown>) {
    return criar(
      await requisicao("POST", "/api/usuarios", {
        usuario: admin,
        corpo: { senha: "senha-de-teste-123", ...corpo },
      }),
    );
  }

  async function usucodDe(login: string) {
    const u = await prisma.usuario.findUnique({
      where: { login },
      select: { siscobraUsucod: true },
    });
    return u?.siscobraUsucod ?? null;
  }

  it("é guardado quando o papel é COBRANCA", async () => {
    const res = await novo({
      login: "ana.cobranca",
      nome: "Ana",
      papel: "COBRANCA",
      siscobraUsucod: 1042,
    });
    expect(res.status).toBe(201);
    expect(await usucodDe("ana.cobranca")).toBe(1042);
  });

  it("é ignorado em qualquer outro papel", async () => {
    await novo({
      login: "joao.helpdesk",
      nome: "João",
      papel: "OPERADOR",
      siscobraUsucod: 999,
    });
    expect(await usucodDe("joao.helpdesk")).toBeNull();
  });

  it("sai do papel de cobrança e o código é solto", async () => {
    await novo({
      login: "bia.cobranca",
      nome: "Bia",
      papel: "COBRANCA",
      siscobraUsucod: 77,
    });
    const bia = await prisma.usuario.findUniqueOrThrow({
      where: { login: "bia.cobranca" },
      select: { id: true },
    });

    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${bia.id}`, {
        usuario: admin,
        corpo: { papel: "OPERADOR" },
      }),
      { params: { id: bia.id } },
    );
    expect(res.status).toBe(200);
    expect(await usucodDe("bia.cobranca")).toBeNull();
  });

  it("recusa código zero ou negativo — não identificaria ninguém", async () => {
    const zero = await novo({
      login: "zero.cobranca",
      nome: "Zero",
      papel: "COBRANCA",
      siscobraUsucod: 0,
    });
    expect(zero.status).toBe(400);

    const negativo = await novo({
      login: "neg.cobranca",
      nome: "Neg",
      papel: "COBRANCA",
      siscobraUsucod: -5,
    });
    expect(negativo.status).toBe(400);
  });

  it("pode ficar em branco: operadora sem código ainda é operadora", async () => {
    const res = await novo({
      login: "sem.codigo",
      nome: "Sem código",
      papel: "COBRANCA",
    });
    expect(res.status).toBe(201);
    expect(await usucodDe("sem.codigo")).toBeNull();
  });
});

describe("trava do último admin vale para o papel novo", () => {
  it("não dá para se rebaixar a COBRANCA e deixar o sistema sem TI", async () => {
    const res = await editar(
      await requisicao("PATCH", `/api/usuarios/${admin.id}`, {
        usuario: admin,
        corpo: { papel: "COBRANCA" },
      }),
      { params: { id: admin.id } },
    );
    expect(res.status).toBe(409);
  });
});
