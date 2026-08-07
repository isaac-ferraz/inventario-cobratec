// Concorrência otimista na edição do computador.
//
// Dois analistas abrem a mesma máquina, os dois salvam: sem essa trava, o
// segundo sobrescreveria em silêncio o que o primeiro escreveu — e ninguém
// ficaria sabendo. O `esperaAtualizadoEm` transforma isso em um 409 visível.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as criar } from "@/app/api/computadores/route";
import { PATCH as editar } from "@/app/api/computadores/[id]/route";
import {
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;
let pcId: string;
let versaoInicial: string;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("admin-pcs", "ADMIN");

  const { corpo } = await ler(
    await criar(
      await requisicao("POST", "/api/computadores", {
        usuario: admin,
        corpo: { identificador: "PC-001", apelido: "Recepção" },
      }),
    ),
  );
  pcId = corpo.id as string;
  versaoInicial = corpo.atualizadoEm as string;
});

describe("edição concorrente", () => {
  it("aceita quando a versão bate", async () => {
    const res = await editar(
      await requisicao("PATCH", `/api/computadores/${pcId}`, {
        usuario: admin,
        corpo: { apelido: "Recepção 2", esperaAtualizadoEm: versaoInicial },
      }),
      { params: { id: pcId } },
    );
    expect(res.status).toBe(200);
  });

  it("recusa com 409 quando alguém salvou antes", async () => {
    // O "outro analista" salva primeiro e move o atualizadoEm.
    await editar(
      await requisicao("PATCH", `/api/computadores/${pcId}`, {
        usuario: admin,
        corpo: { apelido: "Alterado por outra pessoa", esperaAtualizadoEm: versaoInicial },
      }),
      { params: { id: pcId } },
    );

    // Nossa tela ainda está com a versão antiga em mãos.
    const res = await editar(
      await requisicao("PATCH", `/api/computadores/${pcId}`, {
        usuario: admin,
        corpo: { apelido: "Minha edição", esperaAtualizadoEm: versaoInicial },
      }),
      { params: { id: pcId } },
    );
    expect(res.status).toBe(409);

    // E, principalmente: o dado do outro continua lá.
    const pc = await prisma.computador.findUnique({
      where: { id: pcId },
      select: { apelido: true },
    });
    expect(pc?.apelido).toBe("Alterado por outra pessoa");
  });

  it("identificador duplicado não passa", async () => {
    const res = await criar(
      await requisicao("POST", "/api/computadores", {
        usuario: admin,
        corpo: { identificador: "PC-001" },
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.computador.count()).toBe(1);
  });
});
