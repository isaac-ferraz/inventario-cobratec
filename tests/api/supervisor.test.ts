// O supervisor de sala visto pela API.
//
// O teste que importa aqui não é "ele consegue ver a sala dele" — é "ele NÃO
// consegue ver a sala do outro". Um `where` esquecido numa rota entrega o parque
// inteiro (incluindo o cofre de senhas) para quem responde por uma sala só.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as listarPcs } from "@/app/api/computadores/route";
import {
  GET as verPc,
  PATCH as editarPc,
} from "@/app/api/computadores/[id]/route";
import { GET as listarFuncs } from "@/app/api/funcionarios/route";
import { GET as verFunc } from "@/app/api/funcionarios/[id]/route";
import { GET as listarSalas } from "@/app/api/salas/route";
import { GET as verSala } from "@/app/api/salas/[id]/route";
import { GET as listarCelulares } from "@/app/api/celulares/route";
import { GET as listarUsuarios } from "@/app/api/usuarios/route";
import { GET as listarAuditoria } from "@/app/api/auditoria/route";
import { POST as moverSala } from "@/app/api/salas/mover/route";
import { POST as novoComponente } from "@/app/api/componentes/route";
import {
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;
let sup: UsuarioTeste; // responde pela sala A
let salaA: string;
let salaB: string;
let pcDaSalaA: string;
let pcDaSalaB: string;
// Máquina registrada na sala B, mas de alguém que senta na A — o caso torto
// que o supervisor precisa enxergar.
let pcDoFuncionarioA: string;
let funcA: string;
let funcB: string;
let tipoId: string;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-sup", "ADMIN");

  const a = await prisma.sala.create({ data: { nome: "Sala A", ordem: 1 } });
  const b = await prisma.sala.create({ data: { nome: "Sala B", ordem: 2 } });
  salaA = a.id;
  salaB = b.id;

  const tipo = await prisma.tipoComponente.create({ data: { nome: "Memória" } });
  tipoId = tipo.id;

  const fa = await prisma.funcionario.create({
    data: {
      nome: "Ana (sala A)",
      cargo: "Operadora",
      salaId: salaA,
      senhaSiscobra: "segredo-da-ana",
    },
  });
  const fb = await prisma.funcionario.create({
    data: {
      nome: "Bruno (sala B)",
      cargo: "Operador",
      salaId: salaB,
      senhaSiscobra: "segredo-do-bruno",
    },
  });
  funcA = fa.id;
  funcB = fb.id;

  pcDaSalaA = (
    await prisma.computador.create({
      data: { identificador: "PC-A", salaId: salaA, funcionarioId: fa.id },
    })
  ).id;
  pcDaSalaB = (
    await prisma.computador.create({
      data: { identificador: "PC-B", salaId: salaB, funcionarioId: fb.id },
    })
  ).id;
  pcDoFuncionarioA = (
    await prisma.computador.create({
      data: { identificador: "PC-A-VIAJANTE", salaId: salaB, funcionarioId: fa.id },
    })
  ).id;
  await prisma.celular.create({
    data: { identificador: "CEL-A", funcionarioId: fa.id },
  });
  await prisma.celular.create({
    data: { identificador: "CEL-B", funcionarioId: fb.id },
  });

  sup = await criarUsuario("sup-a", "SUPERVISOR");
  await prisma.supervisorSala.create({
    data: { usuarioId: sup.id, salaId: salaA },
  });
});

describe("o que o supervisor enxerga", () => {
  it("a lista de computadores traz só os da sala dele", async () => {
    const { status, corpo } = await ler(
      await listarPcs(await requisicao("GET", "/api/computadores", { usuario: sup })),
    );
    expect(status).toBe(200);
    const ids = (corpo as unknown as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(pcDaSalaA);
    // Máquina de outra sala, mas de quem senta na sala dele: entra.
    expect(ids).toContain(pcDoFuncionarioA);
    expect(ids).not.toContain(pcDaSalaB);
  });

  it("a lista de funcionários traz só quem senta na sala dele", async () => {
    const { corpo } = await ler(
      await listarFuncs(await requisicao("GET", "/api/funcionarios", { usuario: sup })),
    );
    const ids = (corpo as unknown as { id: string }[]).map((f) => f.id);
    expect(ids).toEqual([funcA]);
  });

  it("a lista de celulares segue o dono", async () => {
    const { corpo } = await ler(
      await listarCelulares(
        await requisicao("GET", "/api/celulares", { usuario: sup }),
      ),
    );
    const ids = (corpo as unknown as { identificador: string }[]).map(
      (c) => c.identificador,
    );
    expect(ids).toEqual(["CEL-A"]);
  });

  it("o seletor de salas mostra só as dele", async () => {
    const { corpo } = await ler(
      await listarSalas(await requisicao("GET", "/api/salas", { usuario: sup })),
    );
    const ids = (corpo as unknown as { id: string }[]).map((s) => s.id);
    expect(ids).toEqual([salaA]);
  });
});

describe("o que o supervisor NÃO alcança", () => {
  it("computador de outra sala responde 404 (não 403)", async () => {
    const res = await verPc(
      await requisicao("GET", `/api/computadores/${pcDaSalaB}`, { usuario: sup }),
      { params: { id: pcDaSalaB } },
    );
    // 403 confirmaria que aquele patrimônio existe.
    expect(res.status).toBe(404);
  });

  it("não edita computador de outra sala", async () => {
    const res = await editarPc(
      await requisicao("PATCH", `/api/computadores/${pcDaSalaB}`, {
        usuario: sup,
        corpo: { apelido: "invadido" },
      }),
      { params: { id: pcDaSalaB } },
    );
    expect(res.status).toBe(404);
    const pc = await prisma.computador.findUnique({
      where: { id: pcDaSalaB },
      select: { apelido: true },
    });
    expect(pc?.apelido).toBeNull();
  });

  // O perfil carrega o cofre — é o vazamento mais caro possível.
  it("não abre o perfil (nem a senha) de quem senta em outra sala", async () => {
    const res = await verFunc(
      await requisicao("GET", `/api/funcionarios/${funcB}`, { usuario: sup }),
      { params: { id: funcB } },
    );
    expect(res.status).toBe(404);
  });

  it("não abre a página de outra sala", async () => {
    const res = await verSala(
      await requisicao("GET", `/api/salas/${salaB}`, { usuario: sup }),
      { params: { id: salaB } },
    );
    expect(res.status).toBe(404);
  });

  it("não alcança as telas globais do TI", async () => {
    const usuarios = await listarUsuarios(
      await requisicao("GET", "/api/usuarios", { usuario: sup }),
    );
    expect(usuarios.status).toBe(403);
    const auditoria = await listarAuditoria(
      await requisicao("GET", "/api/auditoria", { usuario: sup }),
    );
    expect(auditoria.status).toBe(403);
  });

  it("não põe componente em máquina de outra sala", async () => {
    const res = await novoComponente(
      await requisicao("POST", "/api/componentes", {
        usuario: sup,
        corpo: {
          computadorId: pcDaSalaB,
          tipoId,
          descricao: "Pente forjado",
        },
      }),
    );
    expect(res.status).toBe(404);
    expect(await prisma.componente.count()).toBe(0);
  });
});

describe("o que o supervisor faz na sala dele", () => {
  it("edita o computador da sala", async () => {
    const res = await editarPc(
      await requisicao("PATCH", `/api/computadores/${pcDaSalaA}`, {
        usuario: sup,
        corpo: { apelido: "Estação da recepção" },
      }),
      { params: { id: pcDaSalaA } },
    );
    expect(res.status).toBe(200);
  });

  it("abre o perfil de quem senta na sala, com o cofre", async () => {
    const { status, corpo } = await ler(
      await verFunc(
        await requisicao("GET", `/api/funcionarios/${funcA}`, { usuario: sup }),
        { params: { id: funcA } },
      ),
    );
    expect(status).toBe(200);
    // O TI decidiu que o supervisor enxerga as senhas da equipe dele.
    expect(corpo.senhaSiscobra).toBe("segredo-da-ana");
  });
});

describe("mover equipamento", () => {
  it("não empurra para fora do escopo", async () => {
    const res = await moverSala(
      await requisicao("POST", "/api/salas/mover", {
        usuario: sup,
        corpo: { destinoSalaId: salaB, computadorIds: [pcDaSalaA] },
      }),
    );
    expect(res.status).toBe(403);
    const pc = await prisma.computador.findUnique({
      where: { id: pcDaSalaA },
      select: { salaId: true },
    });
    expect(pc?.salaId).toBe(salaA);
  });

  it("não puxa de outra sala para a dele", async () => {
    const res = await moverSala(
      await requisicao("POST", "/api/salas/mover", {
        usuario: sup,
        corpo: { destinoSalaId: salaA, computadorIds: [pcDaSalaB] },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("o admin move livremente", async () => {
    const res = await moverSala(
      await requisicao("POST", "/api/salas/mover", {
        usuario: admin,
        corpo: { destinoSalaId: salaB, computadorIds: [pcDaSalaA] },
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("supervisor sem sala atribuída", () => {
  it("não enxerga nada — nem tudo", async () => {
    const novo = await criarUsuario("sup-sem-sala", "SUPERVISOR");
    const { corpo } = await ler(
      await listarPcs(
        await requisicao("GET", "/api/computadores", { usuario: novo }),
      ),
    );
    expect(corpo).toHaveLength(0);
  });
});
