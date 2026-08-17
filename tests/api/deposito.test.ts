// Contagem do depósito — o caminho dos botões ± .
//
// O ajuste rápido não passava pelo teto da criação: `delta` era só
// `z.coerce.number().int()`, então 1.000.000.000 unidades de um cabo entravam
// sem reclamação, enquanto criar o item com essa quantidade era recusado. Piso e
// teto agora valem para os dois caminhos.
import { beforeAll, describe, expect, it } from "vitest";
import { POST as criarItem } from "@/app/api/deposito/route";
import { PATCH as ajustar } from "@/app/api/deposito/[id]/route";
import { LIMITE_QUANTIDADE } from "@/lib/validations";
import { criarUsuario, limparBanco, ler, requisicao, type UsuarioTeste } from "./ajuda";

let admin: UsuarioTeste;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-deposito", "ADMIN");
});

async function novoItem(quantidade: number): Promise<string> {
  const { corpo } = await ler(
    await criarItem(
      await requisicao("POST", "/api/deposito", {
        usuario: admin,
        corpo: { nome: `Cabo ${Math.random()}`, quantidade },
      }),
    ),
  );
  return corpo.id as string;
}

async function ajuste(id: string, delta: unknown) {
  return ler(
    await ajustar(
      await requisicao("PATCH", `/api/deposito/${id}`, {
        usuario: admin,
        corpo: { delta },
      }),
      { params: { id } },
    ),
  );
}

describe("ajuste rápido de quantidade", () => {
  it("soma e subtrai o que foi pedido", async () => {
    const id = await novoItem(10);
    expect((await ajuste(id, 5)).corpo.quantidade).toBe(15);
    expect((await ajuste(id, -3)).corpo.quantidade).toBe(12);
  });

  it("nunca fica negativo (piso em 0)", async () => {
    const id = await novoItem(2);
    const { status, corpo } = await ajuste(id, -50);
    expect(status).toBe(200);
    expect(corpo.quantidade).toBe(0);
  });

  it("recusa delta acima do limite de estoque", async () => {
    const id = await novoItem(0);
    const { status } = await ajuste(id, LIMITE_QUANTIDADE + 1);
    expect(status).toBe(400);
  });

  it("não passa do teto somando de pouco em pouco", async () => {
    const id = await novoItem(LIMITE_QUANTIDADE);
    const { status, corpo } = await ajuste(id, LIMITE_QUANTIDADE);
    expect(status).toBe(200);
    expect(corpo.quantidade).toBe(LIMITE_QUANTIDADE);
  });

  it("recusa delta fracionário e não numérico", async () => {
    const id = await novoItem(1);
    expect((await ajuste(id, 2.7)).status).toBe(400);
    expect((await ajuste(id, "abc")).status).toBe(400);
  });

  it("item inexistente responde 404", async () => {
    const { status } = await ajuste("nao-existe", 1);
    expect(status).toBe(404);
  });
});
