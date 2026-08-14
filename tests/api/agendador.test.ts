// O relógio contra um banco de verdade.
//
// `lib/agendador.test.ts` cobre a decisão de horário sem banco. Aqui é o resto:
// a tarefa roda, deixa registro, não roda duas vezes, e a purga apaga (ou não)
// o que deveria. É o tipo de coisa que só quebra em produção às 3h da manhã, e
// por isso precisa de um teste que não dependa de alguém estar olhando.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { limparBanco } from "./ajuda";
import { executar, tique } from "@/lib/agendador";
import { purgarConversas, purgarOrfaos } from "@/lib/chat-purga";

// 03h de 14/08/2026 em São Paulo (o horário da purga) = 06h UTC.
const NA_HORA_DA_PURGA = new Date("2026-08-14T06:00:00Z");

beforeEach(async () => {
  await limparBanco();
  await prisma.aviso.deleteMany();
  await prisma.tarefaAgendada.deleteMany();
  await prisma.fechamentoDiario.deleteMany();
  // O Prisma carrega o .env do projeto ao ser importado, e o .env do
  // desenvolvedor entra no processo (mesma armadilha anotada em
  // chat-waha.test.ts). Sem limpar, as tarefas de cobrança tentariam falar com
  // o CRM de produção durante o teste.
  delete process.env.DB_HOST;
  delete process.env.DB_USER;
  delete process.env.DB_NAME;
  delete process.env.AVISOS_WHATSAPP;
  delete process.env.PURGA_MODO;
});

afterEach(() => vi.clearAllMocks());

/** Uma conversa encerrada há `dias`, com `mensagens` falas. */
async function conversaVelha(telefone: string, dias: number, mensagens = 2) {
  const quando = new Date(Date.now() - dias * 86_400_000);
  const c = await prisma.conversa.create({
    data: {
      telefone,
      situacao: "encerrada",
      encerradaEm: quando,
      ultimaMensagemEm: quando,
      siscobraDevcod: 4242,
      saldo: 1234.5,
      dossie: '{"nome":"FULANO"}',
    },
  });
  for (let i = 0; i < mensagens; i++) {
    await prisma.conversaMensagem.create({
      data: { conversaId: c.id, autor: "devedor", corpo: `fala ${i}` },
    });
  }
  return c;
}

describe("registro de execução", () => {
  it("grava o dia, o resultado e a duração", async () => {
    await executar("purga");
    const t = await prisma.tarefaAgendada.findUnique({ where: { nome: "purga" } });
    expect(t?.ultimoResultado).toBe("ok");
    expect(t?.ultimoDia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t?.duracaoMs).toBeGreaterThanOrEqual(0);
  });

  it("as tarefas de cobrança se pulam sozinhas sem o CRM", async () => {
    await executar("digest-fechamento");
    const t = await prisma.tarefaAgendada.findUnique({
      where: { nome: "digest-fechamento" },
    });
    // "ok" e não "erro": não ter CRM configurado é uma configuração, não uma
    // falha — e marcar como erro encheria a tela de alarme falso.
    expect(t?.ultimoResultado).toBe("ok");
    expect(t?.ultimoDetalhe).toContain("Siscobra não configurado");
  });

  it("tarefa que existe só no nome não faz nada", async () => {
    await executar("tarefa-inventada");
    expect(await prisma.tarefaAgendada.count()).toBe(0);
  });
});

describe("tique", () => {
  it("roda a tarefa da hora e não as outras", async () => {
    const rodadas = await tique(NA_HORA_DA_PURGA);
    expect(rodadas).toEqual(["purga"]);
  });

  it("não roda a mesma tarefa duas vezes no dia", async () => {
    await tique(NA_HORA_DA_PURGA);
    // O caso real: um restart do container cinco minutos depois.
    const segunda = await tique(new Date("2026-08-14T06:05:00Z"));
    expect(segunda).toEqual([]);
  });

  it("de madrugada, fora de qualquer horário, não roda nada", async () => {
    expect(await tique(new Date("2026-08-14T09:00:00Z"))).toEqual([]); // 06h em SP
  });
});

describe("purga — modo seco", () => {
  it("conta o que apagaria e não apaga nada", async () => {
    await conversaVelha("5512900000001", 200);
    await conversaVelha("5512900000002", 200);

    await executar("purga");

    // Nada sumiu.
    expect(await prisma.conversa.count()).toBe(2);
    expect(await prisma.conversaMensagem.count()).toBe(4);

    const aviso = await prisma.aviso.findFirst({ where: { tipo: "purga" } });
    expect(aviso).not.toBeNull();
    expect(aviso?.nivel).toBe("alerta");
    expect(aviso?.corpo).toContain("Modo seco");
    expect(aviso?.corpo).toContain("2 conversa(s)");
  });

  it("o aviso é GRAVADO mesmo sem destinatário de WhatsApp", async () => {
    // A regra inteira do módulo: grava antes de enviar. Se o aviso dependesse
    // do gateway, o dia em que ele cair seria o dia em que ninguém fica sabendo.
    await conversaVelha("5512900000003", 200);
    await executar("purga");

    const aviso = await prisma.aviso.findFirst({ where: { tipo: "purga" } });
    expect(aviso).not.toBeNull();
    expect(aviso?.entrega).toContain("sem destinatário");
  });

  it("não avisa quando não há nada fora da janela", async () => {
    await conversaVelha("5512900000004", 10); // encerrada ontem-ish
    await executar("purga");
    expect(await prisma.aviso.count()).toBe(0);
    const t = await prisma.tarefaAgendada.findUnique({ where: { nome: "purga" } });
    expect(t?.ultimoDetalhe).toContain("nada fora da janela");
  });

  it("não roda duas vezes o mesmo aviso do dia", async () => {
    await conversaVelha("5512900000005", 200);
    await executar("purga");
    await prisma.tarefaAgendada.deleteMany(); // força a reexecução
    await executar("purga");
    // A chave é única por dia: dois avisos idênticos na tela é como se ensina
    // alguém a parar de ler a tela.
    expect(await prisma.aviso.count({ where: { tipo: "purga" } })).toBe(1);
  });
});

describe("purga — modo ativo", () => {
  it("apaga a conversa velha, as mensagens e a memória do robô", async () => {
    process.env.PURGA_MODO = "ativo";
    const velha = await conversaVelha("5512900000006", 200, 3);
    const nova = await conversaVelha("5512900000007", 5, 1);

    await executar("purga");

    expect(await prisma.conversa.findUnique({ where: { id: velha.id } })).toBeNull();
    expect(await prisma.conversa.findUnique({ where: { id: nova.id } })).not.toBeNull();
    // Cascata: nenhuma mensagem órfã da conversa apagada.
    expect(await prisma.conversaMensagem.count({ where: { conversaId: velha.id } })).toBe(0);

    const aviso = await prisma.aviso.findFirst({ where: { tipo: "purga" } });
    expect(aviso?.corpo).toContain("Removidos");
    expect(aviso?.nivel).toBe("info");
  });

  it("não toca em conversa que ainda está viva, por mais antiga que seja", async () => {
    // Conversa parada há um ano na fila é problema de operação. Apagá-la
    // resolveria o sintoma e apagaria a evidência.
    process.env.PURGA_MODO = "ativo";
    const parada = await prisma.conversa.create({
      data: {
        telefone: "5512900000008",
        situacao: "fila",
        ultimaMensagemEm: new Date(Date.now() - 400 * 86_400_000),
      },
    });
    await executar("purga");
    expect(await prisma.conversa.findUnique({ where: { id: parada.id } })).not.toBeNull();
  });

  it("encerrada sem data de encerramento não é apagada", async () => {
    // Registro velho de antes de `encerradaEm` existir: sem data não há como
    // saber se a janela passou, e o padrão seguro é manter.
    process.env.PURGA_MODO = "ativo";
    const semData = await prisma.conversa.create({
      data: { telefone: "5512900000009", situacao: "encerrada", encerradaEm: null },
    });
    await executar("purga");
    expect(await prisma.conversa.findUnique({ where: { id: semData.id } })).not.toBeNull();
  });

  it("respeita a janela configurada", async () => {
    process.env.PURGA_MODO = "ativo";
    process.env.RETENCAO_CONVERSAS_DIAS = "365";
    const c = await conversaVelha("5512900000010", 200);
    await executar("purga");
    // 200 dias está dentro de uma janela de 365: fica.
    expect(await prisma.conversa.findUnique({ where: { id: c.id } })).not.toBeNull();
    delete process.env.RETENCAO_CONVERSAS_DIAS;
  });
});

describe("auditoria antiga", () => {
  it("sai pela janela própria, e a recente fica", async () => {
    process.env.PURGA_MODO = "ativo";
    await prisma.logAuditoria.create({
      data: {
        acao: "criar",
        entidade: "Computador",
        descricao: "antigo",
        criadoEm: new Date(Date.now() - 900 * 86_400_000),
      },
    });
    await prisma.logAuditoria.create({
      data: { acao: "criar", entidade: "Computador", descricao: "recente" },
    });

    await executar("purga");

    const restantes = await prisma.logAuditoria.findMany({ select: { descricao: true } });
    expect(restantes.map((r) => r.descricao)).toContain("recente");
    expect(restantes.map((r) => r.descricao)).not.toContain("antigo");
  });
});

describe("as funções de purga, direto", () => {
  it("em seco, contam sem apagar", async () => {
    await conversaVelha("5512900000011", 200, 4);
    const r = await purgarConversas(new Date(), 180, true);
    expect(r).toEqual({ conversas: 1, mensagens: 4, anexos: 0 });
    expect(await prisma.conversa.count()).toBe(1);
  });

  it("pasta de mídia inexistente não é erro", async () => {
    process.env.CHAT_MIDIA_DIR = "/tmp/pasta-que-nao-existe-cobratec";
    expect(await purgarOrfaos(true)).toBe(0);
    delete process.env.CHAT_MIDIA_DIR;
  });
});
