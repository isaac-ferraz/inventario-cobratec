// Perfil do funcionário: junta numa chamada só o que antes exigia caçar em três
// telas. Como ele carrega o cofre de credenciais, o que NÃO pode sair junto
// importa tanto quanto o que sai.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as perfil } from "@/app/api/funcionarios/[id]/route";
import {
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;
let operador: UsuarioTeste;
let funcionarioId: string;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("admin-perfil", "ADMIN");
  operador = await criarUsuario("operador-perfil", "OPERADOR");

  const sala = await prisma.sala.create({ data: { nome: "Operação", ordem: 1 } });
  const tipo = await prisma.tipoComponente.create({ data: { nome: "Memória RAM" } });

  const f = await prisma.funcionario.create({
    data: {
      nome: "Ana Souza",
      cargo: "Operadora",
      salaId: sala.id,
      loginSiscobra: "ana.souza",
      senhaSiscobra: "segredo-siscobra",
    },
  });
  funcionarioId = f.id;

  const pc = await prisma.computador.create({
    data: { identificador: "PC-ANA", apelido: "Estação 4", funcionarioId: f.id, salaId: sala.id },
  });
  await prisma.componente.create({
    data: { computadorId: pc.id, tipoId: tipo.id, descricao: "Kingston 8GB DDR4" },
  });
  await prisma.celular.create({
    data: { identificador: "CEL-ANA", numero: "11 90000-0000", funcionarioId: f.id },
  });
});

describe("GET /api/funcionarios/[id]", () => {
  it("traz a pessoa com computadores, hardware e celulares", async () => {
    const { status, corpo } = await ler(
      await perfil(
        await requisicao("GET", `/api/funcionarios/${funcionarioId}`, {
          usuario: admin,
        }),
        { params: { id: funcionarioId } },
      ),
    );
    expect(status).toBe(200);
    expect(corpo.nome).toBe("Ana Souza");

    const pcs = corpo.computadores as { componentes: unknown[] }[];
    expect(pcs).toHaveLength(1);
    // O hardware precisa vir junto: é o que a tela mostra sem uma segunda ida.
    expect(pcs[0].componentes).toHaveLength(1);
    expect(corpo.celulares).toHaveLength(1);
    expect((corpo.sala as { nome: string }).nome).toBe("Operação");
  });

  it("não devolve hash de senha de usuário nenhum", async () => {
    const { corpo } = await ler(
      await perfil(
        await requisicao("GET", `/api/funcionarios/${funcionarioId}`, {
          usuario: admin,
        }),
        { params: { id: funcionarioId } },
      ),
    );
    expect(JSON.stringify(corpo)).not.toContain("senhaHash");
  });

  it("operador não abre o perfil (é o cofre de credenciais)", async () => {
    const res = await perfil(
      await requisicao("GET", `/api/funcionarios/${funcionarioId}`, {
        usuario: operador,
      }),
      { params: { id: funcionarioId } },
    );
    expect(res.status).toBe(403);
  });

  it("sem sessão, 401", async () => {
    const res = await perfil(
      await requisicao("GET", `/api/funcionarios/${funcionarioId}`),
      { params: { id: funcionarioId } },
    );
    expect(res.status).toBe(401);
  });

  it("id inexistente responde 404", async () => {
    const res = await perfil(
      await requisicao("GET", "/api/funcionarios/nao-existe", { usuario: admin }),
      { params: { id: "nao-existe" } },
    );
    expect(res.status).toBe(404);
  });
});
