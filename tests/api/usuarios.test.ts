// Travas que impedem o TI de se trancar para fora do próprio sistema.
//
// Sem elas, um clique errado ("inativar") no último administrador deixaria o
// sistema sem ninguém capaz de criar usuários — e o único conserto seria mexer
// no banco na mão.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PATCH as editar, DELETE as remover } from "@/app/api/usuarios/[id]/route";
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
