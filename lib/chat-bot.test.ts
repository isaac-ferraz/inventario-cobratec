// O que o modelo nunca chega a ver, e onde ele mora.
//
// As travas de SAÍDA que este arquivo testava (valor inventado, telefone
// inventado, eco do formulário) sumiram na decisão 32 junto com a função que as
// aplicava: o modelo não escreve mais nada que o devedor leia, então não há
// texto dele para conferir. O que restou aqui é o que continua importando —
// a trava de ENTRADA (assunto que nem chega ao modelo) e a pergunta de onde o
// modelo está rodando, que decide se a fala do devedor sai da empresa.
//
// A conversa em si é testada em `lib/chat-fluxo.test.ts`.
import { describe, expect, it, vi } from "vitest";
import { assuntoExigeGente, classificar, ehLocal } from "@/lib/chat-bot";

function resposta(texto: string, escalar = false) {
  return JSON.stringify({ resposta: texto, escalar, motivo: "" });
}

// A trava de ENTRADA, e a lição mais cara desta rodada: medindo com
// `llama3.2:1b`, "já paguei mês passado" recebeu "Não, ainda não" e "vou chamar
// meu advogado" fez o modelo inventar um telefone. Onde há risco jurídico, o
// modelo não é consultado — quem responde é gente.
describe("o que nem chega a ser perguntado ao modelo", () => {
  const paraGente: Array<[string, RegExp]> = [
    ["já paguei mês passado", /pagou/],
    ["mandei o comprovante ontem", /pagou/],
    ["vou chamar meu advogado", /jurídic/],
    ["vou no Procon", /jurídic/],
    ["quanto eu devo?", /dívida/],
    ["quero negociar", /dívida/],
    ["me manda o boleto", /dívida/],
    ["faz por pix?", /dívida/],
    ["meu cpf é 123.456.789-00", /dado pessoal/],
    ["essa dívida não é minha", /dívida/],
    ["isso é golpe", /contesta/],
    // Fato sobre a empresa também é dado que o robô não tem: medido, ele
    // inventou que a Cobratec não atende aos sábados.
    ["vocês atendem sábado?", /operacional/],
    ["qual o horário de vocês?", /operacional/],
    ["qual o endereço?", /operacional/],
  ];

  for (const [texto, motivo] of paraGente) {
    it(`"${texto}" vai direto para a fila`, () => {
      expect(assuntoExigeGente(texto)).toMatch(motivo);
    });
  }

  // Se tudo escalasse, o robô não serviria para nada — a conversa fiada é
  // exatamente o que sobra para ele.
  it("saudação e pergunta inocente seguem para o robô", () => {
    expect(assuntoExigeGente("oi")).toBeNull();
    expect(assuntoExigeGente("bom dia, tudo bem?")).toBeNull();
    expect(assuntoExigeGente("obrigado!")).toBeNull();
    expect(assuntoExigeGente("")).toBeNull();
    // Continua com o robô: é a abertura mais comum e os dois modelos medidos
    // respondem certo ("sou a recepcionista da Cobratec").
    expect(assuntoExigeGente("quem fala?")).toBeNull();
  });

  // Esta regra já existiu, escalando, e foi REMOVIDA na decisão 32 — o
  // caminho oposto do resto deste arquivo, e por um bom motivo. "O que vocês
  // fazem?" era escalada porque o modelo respondia "empresa de tecnologia" (3B)
  // e "um serviço de pagamento da Receita Federal" (1B). Com o texto virando
  // molde, a resposta é uma string fixa: dá para atender sem risco nenhum.
  it("quem a empresa é agora tem molde, e volta para o robô", () => {
    for (const fala of [
      "quem são vocês?",
      "o que voces fazem?",
      "que empresa é essa?",
      "o que é a cobratec?",
    ]) {
      expect(assuntoExigeGente(fala)).toBeNull();
    }
  });

  // Horário e endereço continuam escalando: esses são fatos que o CÓDIGO
  // também não tem, então não há molde honesto a escrever.
  it("horário e endereço continuam sendo de gente", () => {
    expect(assuntoExigeGente("vocês atendem sábado?")).toMatch(/operacional/);
    expect(assuntoExigeGente("qual o endereço de vocês?")).toMatch(/operacional/);
  });
});

describe("dentro ou fora da rede", () => {
  const dentro = [
    "http://127.0.0.1:11434",
    "http://localhost:11434",
    "http://host.docker.internal:11434",
    "http://10.0.0.5:11434",
    "http://192.168.1.20:11434",
    "http://172.20.0.3:11434",
    "http://servidor-ti:11434", // nome de container/host da LAN
    "http://ollama.local:11434",
  ];
  for (const url of dentro) {
    it(`local: ${url}`, () => expect(ehLocal(url)).toBe(true));
  }

  const fora = [
    "https://abc-def.trycloudflare.com",
    "https://1a2b3c.ngrok-free.app",
    "http://8.8.8.8:11434",
    // Faixa vizinha da privada: 172.15 e 172.32 são internet.
    "http://172.15.0.1:11434",
    "http://172.32.0.1:11434",
    "não é uma url",
  ];
  for (const url of fora) {
    it(`fora: ${url}`, () => expect(ehLocal(url)).toBe(false));
  }
});

describe("o segredo do proxy", () => {
  // Sem este cabeçalho o proxy do notebook (decisão 31.1) responde 401, o
  // classificador falha e TODA conversa cai na fila. O robô não quebra — mas
  // some, e some em silêncio se ninguém testar isto.
  function espiar(resposta: unknown = { intencao: "saudacao" }) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { content: JSON.stringify(resposta) } })),
    );
  }

  it("sem OLLAMA_TOKEN, a chamada vai sem Authorization", async () => {
    const espiao = espiar();
    await classificar({ url: "http://127.0.0.1:11434", modelo: "m", token: null }, [], "oi");

    const enviados = espiao.mock.calls[0][1]?.headers as Record<string, string>;
    expect(enviados.authorization).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("com OLLAMA_TOKEN, vai como Bearer", async () => {
    const espiao = espiar();
    await classificar(
      { url: "https://abc.trycloudflare.com", modelo: "m", token: "segredo" },
      [],
      "oi",
    );

    const enviados = espiao.mock.calls[0][1]?.headers as Record<string, string>;
    expect(enviados.authorization).toBe("Bearer segredo");
    vi.restoreAllMocks();
  });

  // Proxy recusando o token é falha como outra qualquer: vira "outro", que é
  // gente. Nunca uma resposta ao devedor.
  it("proxy recusando o token classifica como 'outro'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":"token inválido"}', { status: 401 }),
    );
    const l = await classificar(
      { url: "https://abc.trycloudflare.com", modelo: "m", token: "errado" },
      [],
      "oi",
    );
    expect(l.intencao).toBe("outro");
    vi.restoreAllMocks();
  });

  it("modelo fora do ar também vira 'outro'", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("conexão recusada"));
    const l = await classificar(
      { url: "http://127.0.0.1:11434", modelo: "m", token: null },
      [],
      "oi",
    );
    expect(l.intencao).toBe("outro");
    vi.restoreAllMocks();
  });
});
