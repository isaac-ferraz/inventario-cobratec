// Modo direto: o gateway de WhatsApp falando com o app, sem n8n no meio.
//
// O que se protege aqui, em ordem de gravidade:
//   1. o portão de máquina é o MESMO do webhook do n8n (token, não cookie);
//   2. sem robô do outro lado, a mensagem cai na FILA — não em "bot", que
//      esconderia o devedor esperando um atendimento que ninguém ligou;
//   3. o que NÃO pode virar conversa: eco da própria resposta, grupo, broadcast;
//   4. quem liga e desliga a linha é o TI, não a operadora;
//   5. mensagem só é gravada se o gateway aceitou entregar;
//   6. o robô só fala onde não tem como fazer estrago — assunto de dívida,
//      pagamento ou advogado vai para gente sem passar pelo modelo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "@/lib/prisma";
import { POST as webhookWaha } from "@/app/api/chat/waha/webhook/route";
import { GET as servirMidia } from "@/app/api/chat/conversas/[id]/midia/[mensagemId]/route";
import { GET as eventos } from "@/app/api/chat/eventos/route";
import { assinar, totalDeOuvintes } from "@/lib/chat-eventos";
import {
  GET as conexao,
  POST as agirConexao,
} from "@/app/api/chat/conexao/route";
import { POST as responder } from "@/app/api/chat/conversas/[id]/mensagens/route";
import {
  cookieDe,
  criarUsuario,
  limparBanco,
  ler,
  requisicao,
  type UsuarioTeste,
} from "./ajuda";

const TOKEN = "token-de-servico-para-testes";
const GATEWAY = "http://gateway-de-teste:3001";
// Pasta descartável: o teste de anexo grava arquivo de verdade, e ele não pode
// cair na pasta de mídia do desenvolvedor.
const PASTA_MIDIA = join(tmpdir(), "cobratec-teste-midia");

let admin: UsuarioTeste;
let cobranca: UsuarioTeste;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-waha", "ADMIN");
  cobranca = await criarUsuario("cob-waha", "COBRANCA");
  process.env.CHAT_SERVICE_TOKEN = TOKEN;
  process.env.WAHA_URL = GATEWAY;
  process.env.WAHA_API_KEY = "chave-de-teste";
  // O ponto do modo direto: NÃO existe n8n configurado.
  delete process.env.CHAT_ENVIO_URL;
  // Nem robô — quem quiser um o liga no próprio bloco. Isto não é zelo: o
  // Prisma carrega o `.env` do projeto ao ser importado, então a máquina de
  // quem roda o teste entra no processo. Sem esta linha, o desenvolvedor com
  // `OLLAMA_URL` ligado via os testes de "cai na fila" falharem — e a CI, que
  // não tem `.env`, passar. Teste que muda de resultado conforme a máquina não
  // protege nada.
  delete process.env.OLLAMA_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WAHA_URL;
  delete process.env.WAHA_API_KEY;
  delete process.env.CHAT_MIDIA_DIR;
  rmSync(PASTA_MIDIA, { recursive: true, force: true });
});

// Envelope real do WAHA (conferido contra o container 2026.7).
function eventoDe(payload: Record<string, unknown>, tipo = "message") {
  return {
    id: "evt_01",
    event: tipo,
    session: "default",
    engine: "NOWEB",
    payload,
  };
}

const FALA = {
  id: "false_5512997654321@c.us_3EB0",
  from: "5512997654321@c.us",
  fromMe: false,
  body: "Oi, é sobre a minha dívida",
  _data: { pushName: "Ana" },
};

async function entregar(
  evento: unknown,
  token: string | null = TOKEN,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const req = new Request("http://localhost/api/chat/waha/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(evento),
  });
  return ler(await webhookWaha(req));
}

describe("webhook do gateway: o portão", () => {
  it("sem token não entra", async () => {
    expect((await entregar(eventoDe(FALA), null)).status).toBe(401);
    expect(await prisma.conversa.count()).toBe(0);
  });

  it("token errado não entra", async () => {
    expect((await entregar(eventoDe(FALA), "chutado")).status).toBe(401);
  });

  // Falta de configuração se anuncia em vez de virar caça a credencial errada.
  it("sem CHAT_SERVICE_TOKEN responde 503, não 401", async () => {
    delete process.env.CHAT_SERVICE_TOKEN;
    const { status } = await entregar(eventoDe(FALA), "qualquer");
    expect(status).toBe(503);
  });

  it("cookie de admin não substitui o token", async () => {
    const req = await requisicao("POST", "/api/chat/waha/webhook", {
      usuario: admin,
      corpo: eventoDe(FALA),
    });
    expect((await ler(await webhookWaha(req))).status).toBe(401);
  });
});

describe("webhook do gateway: o que vira atendimento", () => {
  it("a fala do devedor cai na FILA, com nome e telefone normalizados", async () => {
    const { status, corpo } = await entregar(eventoDe(FALA));
    expect(status).toBe(200);
    expect(corpo.situacao).toBe("fila");

    const c = await prisma.conversa.findUnique({
      where: { telefone: "5512997654321" },
      include: { mensagens: true },
    });
    expect(c?.nome).toBe("Ana");
    expect(c?.motivoEscalonamento).toMatch(/modo direto/);
    expect(c?.mensagens).toHaveLength(1);
    expect(c?.mensagens[0].autor).toBe("devedor");
  });

  // A resposta da operadora sai por este mesmo gateway: sem a trava ela voltaria
  // como eco e apareceria duas vezes na thread.
  it("eco da própria resposta é ignorado", async () => {
    const { status, corpo } = await entregar(
      eventoDe({ ...FALA, fromMe: true }),
    );
    expect(status).toBe(200);
    expect(corpo.ignorado).toBe(true);
    expect(await prisma.conversa.count()).toBe(0);
  });

  it("mensagem de grupo é ignorada", async () => {
    const emGrupo = { ...FALA, from: "120363000000000000@g.us" };
    expect((await entregar(eventoDe(emGrupo))).corpo.ignorado).toBe(true);
    expect(await prisma.conversa.count()).toBe(0);
  });

  it("evento de status da sessão é ignorado", async () => {
    const status = eventoDe({ name: "default", status: "WORKING" }, "session.status");
    expect((await entregar(status)).corpo.ignorado).toBe(true);
    expect(await prisma.conversa.count()).toBe(0);
  });

  // Webhook reentrega — é o comportamento normal de qualquer gateway.
  it("reentrega do mesmo waId não duplica a fala", async () => {
    await entregar(eventoDe(FALA));
    const segunda = await entregar(eventoDe(FALA));
    expect(segunda.status).toBe(200);
    expect(segunda.corpo.duplicada).toBe(true);
    expect(await prisma.conversaMensagem.count()).toBe(1);
  });

  // A mesma trava do webhook do n8n: o canal não retoma o que já é de gente.
  it("mensagem nova NÃO tira a conversa de quem já assumiu", async () => {
    await entregar(eventoDe(FALA));
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "humana", responsavelId: cobranca.id },
    });

    await entregar(
      eventoDe({ ...FALA, id: "false_5512997654321@c.us_3EB1", body: "e aí?" }),
    );
    const depois = await prisma.conversa.findUnique({ where: { id: c!.id } });
    expect(depois?.situacao).toBe("humana");
    expect(depois?.responsavelId).toBe(cobranca.id);
  });

  it("conversa encerrada reabre na fila quando o devedor volta a escrever", async () => {
    await entregar(eventoDe(FALA));
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "encerrada", encerradaEm: new Date() },
    });

    const volta = await entregar(
      eventoDe({ ...FALA, id: "false_x_3EB2", body: "voltei" }),
    );
    expect(volta.corpo.situacao).toBe("fila");
  });

  it("corpo que não é JSON responde 400", async () => {
    const req = new Request("http://localhost/api/chat/waha/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: "isto não é json",
    });
    expect((await ler(await webhookWaha(req))).status).toBe(400);
  });
});

describe("anexo do devedor", () => {
  const AUDIO = {
    ...FALA,
    id: "false_5512997654321@c.us_AUDIO",
    body: "",
    hasMedia: true,
    media: {
      mimetype: "audio/ogg; codecs=opus",
      url: "http://localhost:3000/api/files/default/x.ogg",
    },
  };

  beforeEach(() => {
    process.env.CHAT_MIDIA_DIR = PASTA_MIDIA;
  });

  it("áudio vira mensagem na fila E arquivo no disco", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("ogg-falso"), {
        status: 200,
        headers: { "content-type": "audio/ogg" },
      }),
    );

    const { status } = await entregar(eventoDe(AUDIO));
    expect(status).toBe(200);

    const m = await prisma.conversaMensagem.findFirst();
    expect(m?.corpo).toBe("[áudio]");
    expect(m?.midiaTipo).toBe("áudio");
    expect(m?.midiaArquivo).toMatch(/\.ogg$/);
    expect(m?.midiaBytes).toBe(9);
    expect(existsSync(join(PASTA_MIDIA, m!.midiaArquivo!))).toBe(true);
  });

  // A fala do devedor não pode depender de um download.
  it("download que falha NÃO derruba a mensagem", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("erro", { status: 500 }),
    );

    const { status } = await entregar(eventoDe(AUDIO));
    expect(status).toBe(200);

    const m = await prisma.conversaMensagem.findFirst();
    expect(m?.corpo).toBe("[áudio]");
    expect(m?.midiaTipo).toBe("áudio");
    expect(m?.midiaArquivo).toBeNull();
  });

  it("o anexo só sai pelo portão da conversa", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("ogg-falso"), { status: 200 }),
    );
    await entregar(eventoDe(AUDIO));
    const m = (await prisma.conversaMensagem.findFirst())!;
    const params = { params: { id: m.conversaId, mensagemId: m.id } };

    const semSessao = await servirMidia(
      new Request("http://localhost/x"),
      params,
    );
    expect(semSessao.status).toBe(401);

    const supervisor = await criarUsuario("sup-midia", "SUPERVISOR");
    const negado = await servirMidia(
      await requisicao("GET", "/x", { usuario: supervisor }),
      params,
    );
    expect(negado.status).toBe(403);

    const ok = await servirMidia(
      await requisicao("GET", "/x", { usuario: cobranca }),
      params,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("audio/ogg");
  });

  // Sem a amarração, um id de mensagem de outra conversa serviria pela rota de
  // qualquer conversa.
  it("id de mensagem de outra conversa não serve", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("ogg-falso"), { status: 200 }),
    );
    await entregar(eventoDe(AUDIO));
    const m = (await prisma.conversaMensagem.findFirst())!;

    const outra = await prisma.conversa.create({
      data: { telefone: "5511999990000", ultimaMensagemEm: new Date() },
    });
    const res = await servirMidia(
      await requisicao("GET", "/x", { usuario: cobranca }),
      { params: { id: outra.id, mensagemId: m.id } },
    );
    expect(res.status).toBe(404);
  });
});

describe("robô local (Ollama) no modo direto", () => {
  const OLLAMA = "http://ollama-de-teste:11434";
  // Fala INOCENTE de propósito: o `FALA` do resto do arquivo fala em dívida, e
  // agora isso é escalado antes de o modelo abrir a boca (`assuntoExigeGente`).
  // Para exercitar o robô é preciso um assunto que ele possa mesmo atender.
  const OLA = { ...FALA, body: "oi, tudo bem?" };

  beforeEach(() => {
    process.env.OLLAMA_URL = OLLAMA;
    process.env.OLLAMA_MODELO = "llama3.2";
  });

  afterEach(() => {
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODELO;
  });

  // Encaminha cada chamada para o destino certo: o modelo devolve o JSON, o
  // gateway confirma o envio.
  function simular(respostaDoModelo: unknown, gatewayOk = true) {
    const chamadas: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      chamadas.push(u);
      if (u.startsWith(OLLAMA)) {
        return new Response(
          JSON.stringify({
            message: { content: JSON.stringify(respostaDoModelo) },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return gatewayOk
        ? new Response(JSON.stringify({ id: "true_wa_bot" }), { status: 200 })
        : new Response(JSON.stringify({ error: "sessão caiu" }), { status: 422 });
    });
    return chamadas;
  }

  it("com robô ligado, a conversa fica COM ELE e a resposta sai", async () => {
    const chamadas = simular({ resposta: "Olá! Como posso ajudar?", escalar: false });

    const { corpo } = await entregar(eventoDe(OLA));
    expect(corpo.situacao).toBe("bot");

    expect(chamadas.some((c) => c.startsWith(`${OLLAMA}/api/chat`))).toBe(true);
    expect(chamadas.some((c) => c === `${GATEWAY}/api/sendText`)).toBe(true);

    const falas = await prisma.conversaMensagem.findMany({
      orderBy: { criadoEm: "asc" },
    });
    expect(falas.map((m) => m.autor)).toEqual(["devedor", "bot"]);
    expect(falas[1].corpo).toBe("Olá! Como posso ajudar?");
    expect(falas[1].waId).toBe("true_wa_bot");
  });

  // A trava do domínio, agora ponta a ponta: o modelo diz que não é para
  // escalar e inventa um valor. Nada disso pode chegar ao devedor.
  it("valor inventado NÃO é enviado — a conversa vai para a fila", async () => {
    const chamadas = simular({
      resposta: "Seu débito é R$ 1.240,00 e consigo 50% de desconto.",
      escalar: false,
    });

    await entregar(eventoDe(OLA));

    expect(chamadas.some((c) => c === `${GATEWAY}/api/sendText`)).toBe(false);
    const conversa = await prisma.conversa.findFirst();
    expect(conversa?.situacao).toBe("fila");
    expect(conversa?.motivoEscalonamento).toMatch(/valor/);
    expect(await prisma.conversaMensagem.count({ where: { autor: "bot" } })).toBe(0);
  });

  it("robô que pede ajuda humana escala com o motivo dele", async () => {
    simular({ resposta: "Vou chamar uma atendente.", escalar: true, motivo: "quer negociar" });
    await entregar(eventoDe(OLA));

    const conversa = await prisma.conversa.findFirst();
    expect(conversa?.situacao).toBe("fila");
    expect(conversa?.motivoEscalonamento).toBe("quer negociar");
  });

  // Modelo fora do ar não pode virar devedor esquecido numa conversa muda.
  it("modelo fora do ar escala em vez de silenciar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).startsWith(OLLAMA)) throw new Error("conexão recusada");
      return new Response("{}", { status: 200 });
    });

    const { status } = await entregar(eventoDe(OLA));
    expect(status).toBe(200);
    const conversa = await prisma.conversa.findFirst();
    expect(conversa?.situacao).toBe("fila");
    expect(conversa?.motivoEscalonamento).toMatch(/fora do ar/);
  });

  // Entrega primeiro, grava depois: se o WhatsApp recusou, a fala do robô não
  // pode aparecer na thread como se tivesse sido entregue.
  it("gateway recusando o envio não grava a fala do robô", async () => {
    simular({ resposta: "Olá! Como posso ajudar?", escalar: false }, false);
    await entregar(eventoDe(OLA));

    expect(await prisma.conversaMensagem.count({ where: { autor: "bot" } })).toBe(0);
    const conversa = await prisma.conversa.findFirst();
    expect(conversa?.situacao).toBe("fila");
  });

  // A regra mais importante da decisão 28, agora com um robô de verdade atrás.
  it("o robô CALA quando uma operadora já assumiu", async () => {
    simular({ resposta: "Olá!", escalar: false });
    await entregar(eventoDe(OLA));
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "humana", responsavelId: cobranca.id },
    });

    const chamadas = simular({ resposta: "Oi de novo!", escalar: false });
    await entregar(
      eventoDe({ ...OLA, id: "false_x_2", body: "tem alguém aí?" }),
    );

    expect(chamadas.some((c) => c.startsWith(`${OLLAMA}/api/chat`))).toBe(false);
    const depois = await prisma.conversa.findUnique({ where: { id: c!.id } });
    expect(depois?.situacao).toBe("humana");
  });

  // A trava de entrada: assunto grave não paga inferência nem depende de o
  // modelo ter acertado hoje.
  it("assunto de dívida vai para a fila SEM consultar o modelo", async () => {
    const chamadas = simular({ resposta: "não deveria ser usada", escalar: false });

    await entregar(
      eventoDe({ ...FALA, body: "quanto eu devo? quero negociar" }),
    );

    expect(chamadas.some((c) => c.startsWith(OLLAMA))).toBe(false);
    const conversa = await prisma.conversa.findFirst();
    expect(conversa?.situacao).toBe("fila");
    expect(conversa?.motivoEscalonamento).toMatch(/dívida/);
  });

  it("quem diz que já pagou fala com gente, não com o robô", async () => {
    const chamadas = simular({ resposta: "não deveria ser usada", escalar: false });
    await entregar(eventoDe({ ...FALA, body: "já paguei isso mês passado" }));

    expect(chamadas.some((c) => c.startsWith(OLLAMA))).toBe(false);
    expect((await prisma.conversa.findFirst())?.motivoEscalonamento).toMatch(/pagou/);
  });

  it("sem OLLAMA_URL, tudo continua caindo na fila", async () => {
    delete process.env.OLLAMA_URL;
    const { corpo } = await entregar(eventoDe(OLA));
    expect(corpo.situacao).toBe("fila");
  });
});

describe("canal ao vivo", () => {
  it("mensagem nova acende a fila de quem está olhando", async () => {
    const avisos: unknown[] = [];
    const cancelar = assinar((e) => avisos.push(e));

    const { corpo } = await entregar(eventoDe(FALA));
    expect(avisos).toEqual([
      { tipo: "mensagem", conversaId: corpo.conversaId },
    ]);

    cancelar();
  });

  // Reentrega não acende luz para uma mensagem que a operadora já leu.
  it("reentrega não avisa de novo", async () => {
    await entregar(eventoDe(FALA));
    const avisos: unknown[] = [];
    const cancelar = assinar((e) => avisos.push(e));

    await entregar(eventoDe(FALA));
    expect(avisos).toEqual([]);

    cancelar();
  });

  it("evento ignorado não avisa nada", async () => {
    const avisos: unknown[] = [];
    const cancelar = assinar((e) => avisos.push(e));

    await entregar(eventoDe({ ...FALA, fromMe: true }));
    expect(avisos).toEqual([]);

    cancelar();
  });

  it("o canal é do ofício: supervisor de sala não escuta", async () => {
    const sup = await criarUsuario("sup-sse", "SUPERVISOR");
    const res = await eventos(await requisicao("GET", "/api/chat/eventos", { usuario: sup }));
    expect(res.status).toBe(403);
    const semSessao = await eventos(new Request("http://localhost/api/chat/eventos"));
    expect(semSessao.status).toBe(401);
  });

  it("a operadora abre o canal e ele fecha sem deixar ouvinte para trás", async () => {
    const antes = totalDeOuvintes();
    const controle = new AbortController();
    const req = new Request("http://localhost/api/chat/eventos", {
      signal: controle.signal,
      headers: { cookie: await cookieDe(cobranca) },
    });

    const res = await eventos(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(totalDeOuvintes()).toBe(antes + 1);

    // A aba fecha: o ouvinte e o timer têm de ir junto.
    controle.abort();
    await new Promise((r) => setTimeout(r, 10));
    expect(totalDeOuvintes()).toBe(antes);
  });
});

describe("conexão do número: quem liga a linha", () => {
  it("cobrança não alcança — quem pareia é o TI", async () => {
    const { status } = await ler(
      await conexao(await requisicao("GET", "/api/chat/conexao", { usuario: cobranca })),
    );
    expect(status).toBe(403);
  });

  it("admin vê o modo direto e o endereço do webhook", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "WORKING",
          me: { id: "5512988887777@c.us", pushName: "Cobratec" },
          config: {
            webhooks: [
              { url: "http://host.docker.internal:3000/api/chat/waha/webhook" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { status, corpo } = await ler(
      await conexao(await requisicao("GET", "/api/chat/conexao", { usuario: admin })),
    );
    expect(status).toBe(200);
    expect(corpo.modo).toBe("direto");
    expect(corpo.sessao).toMatchObject({
      status: "WORKING",
      numero: "5512988887777",
      webhookOk: true,
    });
  });

  // Com o n8n configurado ele manda: ligar os dois faria a resposta da operadora
  // sair por dois canais.
  it("com o n8n configurado, o modo direto não opera", async () => {
    process.env.CHAT_ENVIO_URL = "http://n8n.invalido/enviar";
    const { corpo } = await ler(
      await conexao(await requisicao("GET", "/api/chat/conexao", { usuario: admin })),
    );
    expect(corpo.modo).toBe("n8n");
    // Nem o robô local: quem responde ali é o robô do n8n.
    expect(corpo.robo).toEqual({ ligado: false, modelo: null });
    delete process.env.CHAT_ENVIO_URL;
  });

  // A tela diz ao TI quem atende primeiro. Se ela mentir sobre isso, ele vai
  // procurar defeito no gateway enquanto o problema é uma variável de ambiente.
  it("a tela sabe se existe robô triando, e qual modelo", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "WORKING" }), { status: 200 }),
    );

    const semRobo = await ler(
      await conexao(await requisicao("GET", "/api/chat/conexao", { usuario: admin })),
    );
    expect(semRobo.corpo.robo).toEqual({ ligado: false, modelo: null });

    process.env.OLLAMA_URL = "http://ollama-de-teste:11434";
    process.env.OLLAMA_MODELO = "llama3.2:1b";
    const comRobo = await ler(
      await conexao(await requisicao("GET", "/api/chat/conexao", { usuario: admin })),
    );
    expect(comRobo.corpo.robo).toEqual({ ligado: true, modelo: "llama3.2:1b" });
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_MODELO;
  });

  // Conexão que recebe e joga fora é pior que conexão que não sobe.
  it("conectar sem CHAT_SERVICE_TOKEN é recusado com 503", async () => {
    delete process.env.CHAT_SERVICE_TOKEN;
    const { status, corpo } = await ler(
      await agirConexao(
        await requisicao("POST", "/api/chat/conexao", {
          usuario: admin,
          corpo: { acao: "conectar" },
        }),
      ),
    );
    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/CHAT_SERVICE_TOKEN/);
  });

  // O gateway responde 201 "Session is already running" a um `start` numa sessão
  // FAILED, e não faz nada. Sem a distinção, "Conectar" vira um botão que mente:
  // avisa que iniciou e deixa a tela em falha para sempre. E FAILED é o estado
  // comum — é onde a sessão para quando ninguém lê o QR a tempo.
  async function conectarCom(status: string): Promise<string[]> {
    const chamadas: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      const metodo = (init as RequestInit | undefined)?.method ?? "GET";
      if (metodo !== "GET") chamadas.push(u);
      return new Response(
        JSON.stringify({
          status,
          config: {
            webhooks: [
              { url: "http://inventario-cobratec:3000/api/chat/waha/webhook" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    process.env.WAHA_WEBHOOK_URL =
      "http://inventario-cobratec:3000/api/chat/waha/webhook";
    await agirConexao(
      await requisicao("POST", "/api/chat/conexao", {
        usuario: admin,
        corpo: { acao: "conectar" },
      }),
    );
    delete process.env.WAHA_WEBHOOK_URL;
    return chamadas;
  }

  it("sessão em falha é REINICIADA, não apenas iniciada", async () => {
    const chamadas = await conectarCom("FAILED");
    expect(chamadas).toEqual([`${GATEWAY}/api/sessions/default/restart`]);
  });

  it("sessão parada é iniciada", async () => {
    const chamadas = await conectarCom("STOPPED");
    expect(chamadas).toEqual([`${GATEWAY}/api/sessions/default/start`]);
  });

  // Idempotente: o TI clica de novo toda vez que algo parece errado, e isso não
  // pode derrubar uma sessão que está funcionando.
  it("sessão conectada não é mexida", async () => {
    expect(await conectarCom("WORKING")).toEqual([]);
  });

  it("ação desconhecida é recusada", async () => {
    const { status } = await ler(
      await agirConexao(
        await requisicao("POST", "/api/chat/conexao", {
          usuario: admin,
          corpo: { acao: "explodir" },
        }),
      ),
    );
    expect(status).toBe(400);
  });
});

describe("resposta da operadora pelo gateway direto", () => {
  async function conversaAssumida(): Promise<string> {
    await entregar(eventoDe(FALA));
    const c = await prisma.conversa.findFirst();
    await prisma.conversa.update({
      where: { id: c!.id },
      data: { situacao: "humana", responsavelId: cobranca.id },
    });
    return c!.id;
  }

  it("envia pelo gateway e grava com o id da mensagem", async () => {
    const id = await conversaAssumida();
    const enviar = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "true_5512997654321@c.us_9F" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { status } = await ler(
      await responder(
        await requisicao("POST", `/api/chat/conversas/${id}/mensagens`, {
          usuario: cobranca,
          corpo: { corpo: "Bom dia, Ana. Consigo parcelar em 3x." },
        }),
        { params: { id } },
      ),
    );

    expect(status).toBe(201);
    const chamada = enviar.mock.calls[0];
    expect(String(chamada[0])).toBe(`${GATEWAY}/api/sendText`);
    expect(JSON.parse(String((chamada[1] as RequestInit).body))).toMatchObject({
      chatId: "5512997654321@c.us",
      text: "Bom dia, Ana. Consigo parcelar em 3x.",
    });
    const gravada = await prisma.conversaMensagem.findFirst({
      where: { autor: "operadora" },
    });
    expect(gravada?.waId).toBe("true_5512997654321@c.us_9F");
  });

  // Mensagem repetida é constrangimento; mensagem fantasma é uma promessa que a
  // empresa não sabe que fez.
  it("gateway sem número pareado: NÃO grava a resposta", async () => {
    const id = await conversaAssumida();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Session status is not as expected" }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );

    const { status, corpo } = await ler(
      await responder(
        await requisicao("POST", `/api/chat/conversas/${id}/mensagens`, {
          usuario: cobranca,
          corpo: { corpo: "alguém aí?" },
        }),
        { params: { id } },
      ),
    );

    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/NÃO foi enviada/);
    expect(await prisma.conversaMensagem.count({ where: { autor: "operadora" } })).toBe(0);
  });

  it("sem n8n e sem gateway, a tela avisa em vez de fingir que enviou", async () => {
    const id = await conversaAssumida();
    delete process.env.WAHA_URL;

    const { status, corpo } = await ler(
      await responder(
        await requisicao("POST", `/api/chat/conversas/${id}/mensagens`, {
          usuario: cobranca,
          corpo: { corpo: "oi" },
        }),
        { params: { id } },
      ),
    );
    expect(status).toBe(503);
    expect(String(corpo.erro)).toMatch(/WAHA_URL/);
  });
});
