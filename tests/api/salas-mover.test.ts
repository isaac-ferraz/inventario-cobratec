// Movimentação entre salas — o que a resposta promete.
//
// A rota dizia `ok: true` para um lote em que parte dos ids não existia mais,
// devolvendo só um total menor. Quem estava com a tela velha aberta (o item foi
// removido em outra aba) lia "sucesso" onde nada aconteceu. Agora a seleção
// inteira é conferida antes: ou move tudo, ou 404 pedindo para atualizar.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as mover } from "@/app/api/salas/mover/route";
import { criarUsuario, limparBanco, ler, requisicao, type UsuarioTeste } from "./ajuda";

let admin: UsuarioTeste;
let salaA: string;
let salaB: string;
let pc: string;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-mover", "ADMIN");
  salaA = (await prisma.sala.create({ data: { nome: "Sala A", ordem: 1 } })).id;
  salaB = (await prisma.sala.create({ data: { nome: "Sala B", ordem: 2 } })).id;
  pc = (
    await prisma.computador.create({
      data: { identificador: "PC-1", salaId: salaA },
    })
  ).id;
});

async function pedirMover(corpo: unknown) {
  return ler(
    await mover(
      await requisicao("POST", "/api/salas/mover", { usuario: admin, corpo }),
    ),
  );
}

async function salaDoPc(): Promise<string | null> {
  const c = await prisma.computador.findUnique({
    where: { id: pc },
    select: { salaId: true },
  });
  return c?.salaId ?? null;
}

describe("seleção com id que não existe", () => {
  it("recusa o lote inteiro com 404", async () => {
    const { status, corpo } = await pedirMover({
      destinoSalaId: salaB,
      computadorIds: [pc, "id-que-nao-existe"],
    });
    expect(status).toBe(404);
    expect(String(corpo.erro)).toMatch(/não existe/i);
  });

  it("e não move o item válido que vinha no mesmo lote", async () => {
    await pedirMover({
      destinoSalaId: salaB,
      computadorIds: [pc, "id-que-nao-existe"],
    });
    expect(await salaDoPc()).toBe(salaA);
  });

  it("vale também para funcionário inexistente", async () => {
    const { status } = await pedirMover({
      destinoSalaId: salaB,
      funcionarioIds: ["fantasma"],
    });
    expect(status).toBe(404);
  });
});

describe("movimentação válida", () => {
  it("move e conta o que moveu", async () => {
    const { status, corpo } = await pedirMover({
      destinoSalaId: salaB,
      computadorIds: [pc],
    });
    expect(status).toBe(200);
    expect(corpo.computadores).toBe(1);
    expect(await salaDoPc()).toBe(salaB);
  });

  it("id repetido na seleção não vira falso 'não existe'", async () => {
    const { status, corpo } = await pedirMover({
      destinoSalaId: salaB,
      computadorIds: [pc, pc],
    });
    expect(status).toBe(200);
    expect(corpo.computadores).toBe(1);
  });

  it("mover para a sala onde já está é 200 com contagem 0 — e agora só isso significa 'já estava lá'", async () => {
    const { status, corpo } = await pedirMover({
      destinoSalaId: salaA,
      computadorIds: [pc],
    });
    expect(status).toBe(200);
    expect(corpo.computadores).toBe(0);
  });

  it("tirar da sala (destino null) solta o item", async () => {
    const { status } = await pedirMover({
      destinoSalaId: null,
      computadorIds: [pc],
    });
    expect(status).toBe(200);
    expect(await salaDoPc()).toBeNull();
  });

  it("sala de destino inexistente responde 404", async () => {
    const { status } = await pedirMover({
      destinoSalaId: "sala-fantasma",
      computadorIds: [pc],
    });
    expect(status).toBe(404);
  });

  it("seleção vazia responde 400", async () => {
    const { status } = await pedirMover({ destinoSalaId: salaB });
    expect(status).toBe(400);
  });
});
