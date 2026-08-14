// Conversas com devedor pela rota — com banco de verdade.
//
// O que se protege aqui, em ordem de gravidade:
//   1. quem alcança a conversa (o supervisor de sala NÃO alcança — decisão 27);
//   2. o webhook é idempotente (reentrega não duplica a fala do devedor);
//   3. o robô não rouba de volta conversa que já está com gente;
//   4. mensagem só é gravada se o WhatsApp aceitou entregar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as webhook } from "@/app/api/chat/webhook/route";
import { GET as listar } from "@/app/api/chat/conversas/route";
import {
  DELETE as apagarConversa,
  GET as detalhar,
  PATCH as mudarSituacao,
} from "@/app/api/chat/conversas/[id]/route";
import { POST as responder } from "@/app/api/chat/conversas/[id]/mensagens/route";
import { criarUsuario, limparBanco, ler, requisicao, type UsuarioTeste } from "./ajuda";

const TOKEN = "token-de-servico-para-testes";

let admin: UsuarioTeste;
let cobranca: UsuarioTeste;
let outraCobranca: UsuarioTeste;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-chat", "ADMIN");
  cobranca = await criarUsuario("cob-ana", "COBRANCA");
  outraCobranca = await criarUsuario("cob-bia", "COBRANCA");
  process.env.CHAT_SERVICE_TOKEN = TOKEN;
  process.env.CHAT_ENVIO_URL = "http://n8n.invalido/enviar";
  // Este arquivo cobre o caminho do n8n. O modo direto (decisão 29) é apagado
  // explicitamente porque o vitest lê o `.env` da máquina: um dev com o gateway
  // configurado veria o teste de "sem serviço configurado" passar a enviar de
  // verdade — e o teste diria o contrário do que quer dizer.
  delete process.env.WAHA_URL;
  // O envio real é do n8n; aqui interessa a regra, não a rede.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ waId: "wa-enviado" }), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function entregar(corpo: Record<string, unknown>, token: string | null = TOKEN) {
  const req = new Request("http://localhost/api/chat/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
  return ler(await webhook(req));
}

const MSG = {
  telefone: "+55 (12) 99765-4321",
  autor: "devedor",
  corpo: "Oi, recebi uma mensagem de vocês",
};

describe("webhook: o portão de máquina", () => {
  it("sem token não entra", async () => {
    const { status } = await entregar(MSG, null);
    expect(status).toBe(401);
  });

  it("token errado não entra", async () => {
    const { status } = await entregar(MSG, "token-chutado");
    expect(status).toBe(401);
  });

  // Falta de configuração se anuncia em vez de virar caça a credencial errada.
  it("sem CHAT_SERVICE_TOKEN configurado responde 503, não 401", async () => {
    delete process.env.CHAT_SERVICE_TOKEN;
    const { status, corpo } = await entregar(MSG, "qualquer");
    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/não configurado/);
  });

  // Cookie de gente não abre a porta de máquina, e vice-versa.
  it("sessão de admin não substitui o token", async () => {
    const req = await requisicao("POST", "/api/chat/webhook", {
      usuario: admin,
      corpo: MSG,
    });
    const { status } = await ler(await webhook(req));
    expect(status).toBe(401);
  });
});

describe("webhook: criar e reabrir conversa", () => {
  it("primeira mensagem cria a conversa no robô, com telefone normalizado", async () => {
    const { status, corpo } = await entregar(MSG);
    expect(status).toBe(200);
    expect(corpo.situacao).toBe("bot");

    const c = await prisma.conversa.findUnique({
      where: { telefone: "5512997654321" },
      include: { mensagens: true },
    });
    expect(c).not.toBeNull();
    expect(c!.mensagens).toHaveLength(1);
    expect(c!.mensagens[0].autor).toBe("devedor");
  });

  // As variações do mesmo número não podem virar conversas diferentes: o
  // histórico quebraria no meio do atendimento.
  it("o mesmo número escrito de outro jeito cai na MESMA conversa", async () => {
    await entregar(MSG);
    await entregar({ ...MSG, telefone: "5512997654321", corpo: "Alô?" });
    expect(await prisma.conversa.count()).toBe(1);
    expect(await prisma.conversaMensagem.count()).toBe(2);
  });

  // Webhook reentrega — é o comportamento normal de qualquer gateway.
  it("reentrega do mesmo waId NÃO duplica a fala do devedor", async () => {
    await entregar({ ...MSG, waId: "wa-1" });
    const segunda = await entregar({ ...MSG, waId: "wa-1" });
    expect(segunda.status).toBe(200);
    expect(segunda.corpo.duplicada).toBe(true);
    expect(await prisma.conversaMensagem.count()).toBe(1);
  });

  it("devedor que escreve depois de encerrada reabre no robô", async () => {
    await entregar(MSG);
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "encerrada", encerradaEm: new Date(), responsavelId: cobranca.id },
    });

    const { corpo } = await entregar({ ...MSG, corpo: "Voltei" });
    expect(corpo.situacao).toBe("bot");
    const depois = await prisma.conversa.findUnique({ where: { id: c!.id } });
    expect(depois?.encerradaEm).toBeNull();
    expect(depois?.responsavelId).toBeNull();
  });
});

describe("webhook: identificação antes de valor", () => {
  it("código + flag de identificado grava a marca de conferência", async () => {
    await entregar({
      ...MSG,
      siscobraDevcod: 4242,
      siscobraCarcod: 7,
      carteira: "AÇOS PINDA",
      identificado: true,
    });
    const c = await prisma.conversa.findFirst();
    expect(c?.siscobraDevcod).toBe(4242);
    expect(c?.identificadaEm).not.toBeNull();
  });

  // Palpite do n8n (telefone que casou com um cadastro) não é identificação.
  it("código SEM a flag não marca como identificada", async () => {
    await entregar({ ...MSG, siscobraDevcod: 4242 });
    const c = await prisma.conversa.findFirst();
    expect(c?.siscobraDevcod).toBe(4242);
    expect(c?.identificadaEm).toBeNull();
  });

  it("a marca de identificação não é reescrita a cada mensagem", async () => {
    await entregar({ ...MSG, siscobraDevcod: 1, identificado: true });
    const primeira = (await prisma.conversa.findFirst())!.identificadaEm;
    await new Promise((r) => setTimeout(r, 5));
    await entregar({ ...MSG, siscobraDevcod: 1, identificado: true, corpo: "de novo" });
    const depois = (await prisma.conversa.findFirst())!.identificadaEm;
    expect(depois!.getTime()).toBe(primeira!.getTime());
  });

  // Mesma regra da célula vazia na importação (decisão 26).
  it("webhook sem dossiê não apaga o dossiê que já existe", async () => {
    await entregar({ ...MSG, dossie: { saldo: 1234.5 } });
    await entregar({ ...MSG, corpo: "outra mensagem" });
    const c = await prisma.conversa.findFirst();
    expect(c?.dossie).toContain("1234.5");
  });
});

describe("webhook: escalonamento", () => {
  it("escalar leva o robô para a fila, com o motivo", async () => {
    await entregar({ ...MSG, escalar: true, motivoEscalonamento: "pediu_humano" });
    const c = await prisma.conversa.findFirst();
    expect(c?.situacao).toBe("fila");
    expect(c?.motivoEscalonamento).toBe("pediu_humano");
  });

  // A trava central do webhook: o robô não retoma o que já é de gente.
  it("escalar NÃO tira a conversa de quem já assumiu", async () => {
    await entregar(MSG);
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "humana", responsavelId: cobranca.id },
    });

    await entregar({ ...MSG, escalar: true, corpo: "mais uma" });
    const depois = await prisma.conversa.findUnique({ where: { id: c!.id } });
    expect(depois?.situacao).toBe("humana");
    expect(depois?.responsavelId).toBe(cobranca.id);
  });
});

describe("fila: quem alcança", () => {
  beforeEach(async () => {
    await entregar({ ...MSG, escalar: true, motivoEscalonamento: "pediu_humano" });
  });

  it("cobrança vê a fila", async () => {
    const { status, corpo } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas", { usuario: cobranca })),
    );
    expect(status).toBe(200);
    expect((corpo.conversas as unknown[]).length).toBe(1);
  });

  it("admin vê a fila", async () => {
    const { status } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas", { usuario: admin })),
    );
    expect(status).toBe(200);
  });

  // O ponto da decisão 27: alcance sobre dado de devedor é do ofício, não da sala.
  it("supervisor de sala NÃO vê conversa nenhuma", async () => {
    const sup = await criarUsuario("sup-sala", "SUPERVISOR");
    const { status } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas", { usuario: sup })),
    );
    expect(status).toBe(403);
  });

  it("operador de helpdesk também não", async () => {
    const op = await criarUsuario("op-helpdesk", "OPERADOR");
    const { status } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas", { usuario: op })),
    );
    expect(status).toBe(403);
  });

  it("sem sessão, 401", async () => {
    const { status } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas")),
    );
    expect(status).toBe(401);
  });

  it("a última fala aparece na fila, para saber do que se trata sem abrir", async () => {
    const { corpo } = await ler(
      await listar(await requisicao("GET", "/api/chat/conversas", { usuario: cobranca })),
    );
    const primeira = (corpo.conversas as { ultimaMensagem: { corpo: string } }[])[0];
    expect(primeira.ultimaMensagem.corpo).toMatch(/recebi uma mensagem/);
  });
});

describe("assumir, devolver e encerrar", () => {
  let id: string;

  beforeEach(async () => {
    await entregar({ ...MSG, escalar: true });
    id = (await prisma.conversa.findFirst())!.id;
  });

  const patch = async (usuario: UsuarioTeste, situacao: string) =>
    ler(
      await mudarSituacao(
        await requisicao("PATCH", `/api/chat/conversas/${id}`, {
          usuario,
          corpo: { situacao },
        }),
        { params: { id } },
      ),
    );

  it("assumir prende a conversa a quem assumiu e registra o marco na thread", async () => {
    const { status } = await patch(cobranca, "humana");
    expect(status).toBe(200);
    const c = await prisma.conversa.findUnique({
      where: { id },
      include: { mensagens: { orderBy: { criadoEm: "desc" }, take: 1 } },
    });
    expect(c?.responsavelId).toBe(cobranca.id);
    expect(c?.mensagens[0].autor).toBe("sistema");
    expect(c?.mensagens[0].corpo).toMatch(/assumiu/);
  });

  it("colega não toma conversa que já está com outra atendente", async () => {
    await patch(cobranca, "humana");
    const { status, corpo } = await patch(outraCobranca, "humana");
    expect(status).toBe(409);
    expect(String(corpo.erro)).toMatch(/já está com/);
  });

  it("o admin resolve o impasse e toma a conversa", async () => {
    await patch(cobranca, "humana");
    const { status } = await patch(admin, "humana");
    expect(status).toBe(200);
  });

  // A regra mais importante da tabela de transições.
  it("NÃO devolve ao robô o que já teve atendimento humano", async () => {
    await patch(cobranca, "humana");
    const { status, corpo } = await patch(cobranca, "bot");
    expect(status).toBe(409);
    expect(String(corpo.erro)).toMatch(/encerre em vez disso/);
  });

  it("devolver para a fila solta o dono", async () => {
    await patch(cobranca, "humana");
    const { status } = await patch(cobranca, "fila");
    expect(status).toBe(200);
    const c = await prisma.conversa.findUnique({ where: { id } });
    expect(c?.responsavelId).toBeNull();
  });

  it("encerrar marca a data e sai da fila", async () => {
    await patch(cobranca, "humana");
    await patch(cobranca, "encerrada");
    const c = await prisma.conversa.findUnique({ where: { id } });
    expect(c?.situacao).toBe("encerrada");
    expect(c?.encerradaEm).not.toBeNull();
  });

  it("assumir e encerrar entram na auditoria", async () => {
    await patch(cobranca, "humana");
    const logs = await prisma.logAuditoria.findMany({
      where: { entidade: "Conversa" },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].descricao).toMatch(/fila → humana/);
  });

  it("id inexistente responde 404", async () => {
    const res = await mudarSituacao(
      await requisicao("PATCH", "/api/chat/conversas/nao-existe", {
        usuario: cobranca,
        corpo: { situacao: "humana" },
      }),
      { params: { id: "nao-existe" } },
    );
    expect(res.status).toBe(404);
  });
});

describe("responder ao devedor", () => {
  let id: string;

  beforeEach(async () => {
    await entregar({ ...MSG, escalar: true });
    id = (await prisma.conversa.findFirst())!.id;
  });

  const enviar = async (usuario: UsuarioTeste, corpo = "Bom dia, sou da Cobratec") =>
    ler(
      await responder(
        await requisicao("POST", `/api/chat/conversas/${id}/mensagens`, {
          usuario,
          corpo: { corpo },
        }),
        { params: { id } },
      ),
    );

  async function assumir(usuario: UsuarioTeste) {
    return mudarSituacao(
      await requisicao("PATCH", `/api/chat/conversas/${id}`, {
        usuario,
        corpo: { situacao: "humana" },
      }),
      { params: { id } },
    );
  }

  it("quem assumiu responde, e a mensagem vai para a thread", async () => {
    await assumir(cobranca);
    const { status, corpo } = await enviar(cobranca);
    expect(status).toBe(201);
    expect(corpo.autor).toBe("operadora");
    expect(await prisma.conversaMensagem.count({ where: { autor: "operadora" } })).toBe(1);
  });

  it("ninguém escreve por cima do robô sem assumir", async () => {
    const { status, corpo } = await enviar(cobranca);
    expect(status).toBe(409);
    expect(String(corpo.erro)).toMatch(/Assuma a conversa/);
  });

  it("colega não responde na conversa alheia", async () => {
    await assumir(cobranca);
    const { status, corpo } = await enviar(outraCobranca);
    expect(status).toBe(409);
    expect(String(corpo.erro)).toMatch(/outra atendente/);
  });

  // A ordem "entrega primeiro, grava depois": o pior defeito possível aqui é a
  // tela mostrar uma resposta que o devedor nunca recebeu.
  it("gateway fora do ar NÃO grava a mensagem na thread", async () => {
    await assumir(cobranca);
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("sem rede"));

    const { status, corpo } = await enviar(cobranca);
    expect(status).toBe(504);
    expect(String(corpo.erro)).toMatch(/NÃO foi enviada/);
    expect(await prisma.conversaMensagem.count({ where: { autor: "operadora" } })).toBe(0);
  });

  it("gateway recusando o envio também não grava", async () => {
    await assumir(cobranca);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("nope", { status: 500 }),
    );
    const { status } = await enviar(cobranca);
    expect(status).toBe(502);
    expect(await prisma.conversaMensagem.count({ where: { autor: "operadora" } })).toBe(0);
  });

  // "Sem serviço nenhum": nem o n8n (aqui), nem o gateway direto (apagado no
  // beforeEach). Com qualquer um dos dois a resposta sairia de verdade.
  it("sem CHAT_ENVIO_URL a operadora é avisada, não enganada", async () => {
    await assumir(cobranca);
    delete process.env.CHAT_ENVIO_URL;
    const { status, corpo } = await enviar(cobranca);
    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/NÃO foi enviada/);
  });

  it("supervisor de sala não responde ao devedor", async () => {
    const sup = await criarUsuario("sup-2", "SUPERVISOR");
    const { status } = await enviar(sup);
    expect(status).toBe(403);
  });
});

describe("detalhe da conversa", () => {
  it("devolve o dossiê já como objeto, e a thread em ordem", async () => {
    await entregar({ ...MSG, dossie: { saldo: 1234.5, carteira: "AÇOS PINDA" } });
    await entregar({ ...MSG, autor: "bot", corpo: "Olá! Sou o assistente." });
    const id = (await prisma.conversa.findFirst())!.id;

    const { status, corpo } = await ler(
      await detalhar(
        await requisicao("GET", `/api/chat/conversas/${id}`, { usuario: cobranca }),
        { params: { id } },
      ),
    );
    expect(status).toBe(200);
    expect((corpo.dossie as { saldo: number }).saldo).toBe(1234.5);
    const msgs = corpo.mensagens as { autor: string }[];
    expect(msgs.map((m) => m.autor)).toEqual(["devedor", "bot"]);
  });

  it("dossiê corrompido não derruba a conversa", async () => {
    await entregar(MSG);
    const id = (await prisma.conversa.findFirst())!.id;
    await prisma.conversa.update({
      where: { id },
      data: { dossie: "{isto não é json" },
    });

    const { status, corpo } = await ler(
      await detalhar(
        await requisicao("GET", `/api/chat/conversas/${id}`, { usuario: cobranca }),
        { params: { id } },
      ),
    );
    expect(status).toBe(200);
    expect(corpo.dossie).toBeNull();
  });
});

// Apagar a conversa (o "recomeço" que o teste com um número só exige).
//
// O que se protege aqui é a diferença que motivou a rota: apagar NÃO é limpar a
// tela, é fazer o robô esquecer. A memória dele mora na `Conversa`, não nas
// mensagens — então o teste que importa é o de baixo, o que prova que o número
// volta a ser tratado como quem nunca escreveu.
describe("apagar a conversa", () => {
  let id: string;

  beforeEach(async () => {
    await entregar({ ...MSG, escalar: true });
    id = (await prisma.conversa.findFirst())!.id;
  });

  const apagar = async (usuario: UsuarioTeste, alvo = id) =>
    ler(
      await apagarConversa(
        await requisicao("DELETE", `/api/chat/conversas/${alvo}`, { usuario }),
        { params: { id: alvo } },
      ),
    );

  it("cobrança não apaga o registro do que disse ao devedor", async () => {
    const { status } = await apagar(cobranca);
    expect(status).toBe(403);
    expect(await prisma.conversa.count()).toBe(1);
  });

  it("o admin apaga, e as mensagens vão junto pela cascata", async () => {
    expect(await prisma.conversaMensagem.count()).toBeGreaterThan(0);
    const { status } = await apagar(admin);
    expect(status).toBe(200);
    expect(await prisma.conversa.count()).toBe(0);
    expect(await prisma.conversaMensagem.count()).toBe(0);
  });

  it("o robô esquece: o mesmo telefone volta sem identificação nem oferta", async () => {
    // O estado que atrapalha o teste com número único não está na thread —
    // está aqui, em campos da conversa (decisão 32).
    await prisma.conversa.update({
      where: { id },
      data: {
        siscobraDevcod: 4242,
        identificadaEm: new Date(),
        documentoPendente: "12345678909",
        nomePendente: "Fulano De Tal",
        saldo: 1500.5,
        oferta: JSON.stringify({ parcelas: 3 }),
        dossie: JSON.stringify({ nome: "Fulano" }),
      },
    });

    expect((await apagar(admin)).status).toBe(200);

    // Mesma pessoa escrevendo de novo: nasce uma conversa limpa.
    await entregar(MSG);
    const nova = await prisma.conversa.findUnique({
      where: { telefone: "5512997654321" },
    });
    expect(nova).not.toBeNull();
    expect(nova!.id).not.toBe(id);
    expect(nova!.siscobraDevcod).toBeNull();
    expect(nova!.identificadaEm).toBeNull();
    expect(nova!.documentoPendente).toBeNull();
    expect(nova!.nomePendente).toBeNull();
    expect(nova!.saldo).toBeNull();
    expect(nova!.oferta).toBeNull();
    expect(nova!.dossie).toBeNull();
  });

  it("fica na auditoria quem mandou sumir — e sem dado do devedor", async () => {
    await prisma.conversa.update({
      where: { id },
      data: { documentoPendente: "12345678909" },
    });
    await apagar(admin);

    const log = await prisma.logAuditoria.findFirst({
      where: { entidade: "Conversa", acao: "remover" },
    });
    expect(log).not.toBeNull();
    expect(log!.descricao).toMatch(/apagada/);
    // Telefone pode (a rota vizinha já registra); CPF, nunca.
    expect(log!.descricao).not.toMatch(/12345678909/);
  });

  it("id inexistente responde 404", async () => {
    const { status } = await apagar(admin, "nao-existe");
    expect(status).toBe(404);
  });
});
