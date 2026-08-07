// Escopo por papel no helpdesk. É a parte do sistema onde um erro custa caro:
// o operador não pode ver chamado alheio, nem ler a nota interna do TI, nem
// mexer em campos de gestão (prioridade, responsável).
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as listar, POST as abrir } from "@/app/api/chamados/route";
import { GET as detalhar, PATCH as andar } from "@/app/api/chamados/[id]/route";
import { POST as responder } from "@/app/api/chamados/[id]/mensagens/route";
import {
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

let admin: UsuarioTeste;
let ana: UsuarioTeste;
let bruno: UsuarioTeste;
let chamadoDaAna: string;

beforeAll(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-chamados", "ADMIN");
  ana = await criarUsuario("ana-chamados", "OPERADOR");
  bruno = await criarUsuario("bruno-chamados", "OPERADOR");

  const res = await abrir(
    await requisicao("POST", "/api/chamados", {
      usuario: ana,
      corpo: {
        titulo: "Monitor não liga",
        descricao: "A tela fica preta ao ligar a máquina.",
        categoria: "hardware",
      },
    }),
  );
  const { corpo } = await ler(res);
  chamadoDaAna = corpo.id as string;
  expect(chamadoDaAna).toBeTruthy();

  // O TI deixa um recado só para o time.
  await responder(
    await requisicao("POST", `/api/chamados/${chamadoDaAna}/mensagens`, {
      usuario: admin,
      corpo: { corpo: "Fonte já falhou nessa máquina antes.", interna: true },
    }),
    { params: { id: chamadoDaAna } },
  );
  await responder(
    await requisicao("POST", `/api/chamados/${chamadoDaAna}/mensagens`, {
      usuario: admin,
      corpo: { corpo: "Vamos trocar o cabo hoje." },
    }),
    { params: { id: chamadoDaAna } },
  );
});

describe("chamado alheio", () => {
  it("responde 404 — não confirma que o chamado existe", async () => {
    const res = await detalhar(
      await requisicao("GET", `/api/chamados/${chamadoDaAna}`, {
        usuario: bruno,
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(res.status).toBe(404);
  });

  it("também no PATCH e ao responder", async () => {
    const patch = await andar(
      await requisicao("PATCH", `/api/chamados/${chamadoDaAna}`, {
        usuario: bruno,
        corpo: { status: "fechado" },
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(patch.status).toBe(404);

    const msg = await responder(
      await requisicao("POST", `/api/chamados/${chamadoDaAna}/mensagens`, {
        usuario: bruno,
        corpo: { corpo: "Bisbilhotando" },
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(msg.status).toBe(404);
  });

  it("a lista do operador só traz os dele", async () => {
    const { corpo } = await ler(
      await listar(
        await requisicao("GET", "/api/chamados", { usuario: bruno }),
      ),
    );
    expect(corpo.itens).toHaveLength(0);
    // O total também é escopado: senão o operador descobriria quantos chamados
    // existem na empresa só olhando o rodapé da lista.
    expect(corpo.total).toBe(0);
  });

  it("o escopo sobrevive à paginação", async () => {
    const { corpo } = await ler(
      await listar(
        await requisicao("GET", "/api/chamados?pagina=1&limite=100", {
          usuario: bruno,
        }),
      ),
    );
    expect(corpo.itens).toHaveLength(0);
    expect(corpo.temMais).toBe(false);
  });

  it("a página do administrador traz o chamado e o total", async () => {
    const { corpo } = await ler(
      await listar(await requisicao("GET", "/api/chamados", { usuario: admin })),
    );
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.total).toBe(1);
    expect(corpo.temMais).toBe(false);
  });
});

describe("nota interna", () => {
  it("não chega no JSON do solicitante", async () => {
    const { status, corpo } = await ler(
      await detalhar(
        await requisicao("GET", `/api/chamados/${chamadoDaAna}`, {
          usuario: ana,
        }),
        { params: { id: chamadoDaAna } },
      ),
    );
    expect(status).toBe(200);
    const mensagens = corpo.mensagens as { corpo: string; interna: boolean }[];
    expect(mensagens).toHaveLength(1);
    expect(mensagens.every((m) => !m.interna)).toBe(true);
    // O texto da nota não pode vazar nem dentro de outro campo.
    expect(JSON.stringify(corpo)).not.toContain("Fonte já falhou");
  });

  it("o administrador enxerga as duas", async () => {
    const { corpo } = await ler(
      await detalhar(
        await requisicao("GET", `/api/chamados/${chamadoDaAna}`, {
          usuario: admin,
        }),
        { params: { id: chamadoDaAna } },
      ),
    );
    expect(corpo.mensagens).toHaveLength(2);
  });

  it("operador que manda interna:true tem o campo ignorado", async () => {
    await responder(
      await requisicao("POST", `/api/chamados/${chamadoDaAna}/mensagens`, {
        usuario: ana,
        corpo: { corpo: "Tentando marcar como interna", interna: true },
      }),
      { params: { id: chamadoDaAna } },
    );
    const salva = await prisma.chamadoMensagem.findFirst({
      where: { corpo: "Tentando marcar como interna" },
      select: { interna: true },
    });
    expect(salva?.interna).toBe(false);
  });
});

describe("campos de gestão", () => {
  it("operador não define prioridade nem responsável", async () => {
    const { status } = await ler(
      await andar(
        await requisicao("PATCH", `/api/chamados/${chamadoDaAna}`, {
          usuario: ana,
          corpo: { prioridade: "urgente" },
        }),
        { params: { id: chamadoDaAna } },
      ),
    );
    expect(status).toBe(403);

    const comResponsavel = await andar(
      await requisicao("PATCH", `/api/chamados/${chamadoDaAna}`, {
        usuario: ana,
        corpo: { responsavelId: admin.id },
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(comResponsavel.status).toBe(403);
  });

  it("operador não coloca o próprio chamado em andamento", async () => {
    const res = await andar(
      await requisicao("PATCH", `/api/chamados/${chamadoDaAna}`, {
        usuario: ana,
        corpo: { status: "em_andamento" },
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(res.status).toBe(403);
  });

  it("o administrador consegue", async () => {
    const res = await andar(
      await requisicao("PATCH", `/api/chamados/${chamadoDaAna}`, {
        usuario: admin,
        corpo: { prioridade: "alta", responsavelId: admin.id },
      }),
      { params: { id: chamadoDaAna } },
    );
    expect(res.status).toBe(200);
  });
});
