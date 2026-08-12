// A conversa com dado real, ponta a ponta pela rota.
//
// `lib/chat-fluxo.test.ts` cobre as REGRAS turno a turno, sem banco nem rede.
// Aqui a pergunta é outra e complementar: o que a rota GRAVA. É o caminho por
// onde a operadora recebe o quadro do devedor, e ele quebra em silêncio —
// esquecer de persistir o dossiê não derruba nada, só entrega uma tela vazia
// para quem precisa atender.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as webhookWaha } from "@/app/api/chat/waha/webhook/route";
import { criarUsuario, limparBanco, ler } from "./ajuda";

// O Siscobra é dublê: o que se testa aqui é a rota, não o CRM. As consultas de
// verdade foram validadas contra o banco à parte (decisão 32).
vi.mock("@/lib/siscobra", () => ({
  configSiscobra: () => true,
  identificar: vi.fn(),
  dossieDe: vi.fn(),
  regraDaCarteira: vi.fn(),
}));
import { identificar, dossieDe, regraDaCarteira } from "@/lib/siscobra";

const TOKEN = "token-de-servico-para-testes";
const GATEWAY = "http://gateway-de-teste:3001";
const OLLAMA = "http://ollama-de-teste:11434";
const CPF = "52998224725";

const PESSOA = {
  devcod: 88123, carcod: 7, carteira: "Banco X", primeiroNome: "Maria",
  cpfMascarado: "529.***.***-25", saldo: 1240, vencidoDesde: "12/03/2025",
};

const DOSSIE = {
  nome: "MARIA S OLIVEIRA", cpf: "529.***.***-25", carteira: "Banco X",
  saldoDevedor: 1240, vencidoDesde: "12/03/2025",
  contratos: 2, saldoContratos: 1240, ultimoContato: "03/07/2026",
};

beforeEach(async () => {
  await limparBanco();
  await criarUsuario("cob-sis", "COBRANCA");
  process.env.CHAT_SERVICE_TOKEN = TOKEN;
  process.env.WAHA_URL = GATEWAY;
  process.env.WAHA_API_KEY = "chave";
  process.env.OLLAMA_URL = OLLAMA;
  process.env.OLLAMA_MODELO = "llama3.2:3b";
  delete process.env.CHAT_ENVIO_URL;

  vi.mocked(identificar).mockResolvedValue({ achou: [PESSOA], erro: false });
  vi.mocked(dossieDe).mockResolvedValue(DOSSIE);
  vi.mocked(regraDaCarteira).mockResolvedValue({
    maxParcelas: 6, valorMinimoParcela: 50, descontoMaximoPercentual: 30,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WAHA_URL;
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODELO;
});

/** O modelo devolve a intenção; o gateway aceita entregar. */
function simular(intencao: string, extra: object = {}) {
  const enviadas: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.startsWith(OLLAMA)) {
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify({ intencao, ...extra }) } }),
        { status: 200 },
      );
    }
    if (u.endsWith("/api/sendText")) {
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      enviadas.push(corpo.text ?? "");
      return new Response(JSON.stringify({ id: `true_${enviadas.length}` }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
  return enviadas;
}

let seq = 0;
async function devedorDiz(texto: string) {
  const req = new Request("http://localhost/api/chat/waha/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      event: "message",
      payload: {
        id: `false_5512997654321@c.us_${++seq}`,
        from: "5512997654321@c.us",
        fromMe: false,
        body: texto,
        _data: { pushName: "Ana" },
      },
    }),
  });
  return ler(await webhookWaha(req));
}

describe("o que a operadora recebe ao assumir", () => {
  it("identificação grava o quadro inteiro do devedor", async () => {
    const enviadas = simular("identificar");
    await devedorDiz(`meu cpf é ${CPF} e nasci em 12/04/1985`);

    const c = await prisma.conversa.findFirst();
    // O vínculo com o CRM, que é como a operadora abre o cadastro completo.
    expect(c?.siscobraDevcod).toBe(88123);
    expect(c?.siscobraCarcod).toBe(7);
    expect(c?.identificadaEm).toBeInstanceOf(Date);
    expect(c?.carteira).toBe("Banco X");
    // O saldo CONGELADO: é o que o devedor leu, e não muda depois.
    expect(c?.saldo).toBe(1240);

    // E o dossiê, com o que antes obrigava a operadora a ir buscar.
    const d = JSON.parse(c!.dossie!) as typeof DOSSIE;
    expect(d.nome).toBe("MARIA S OLIVEIRA");
    expect(d.cpf).toBe("529.***.***-25");
    expect(d.contratos).toBe(2);
    expect(c?.dossieEm).toBeInstanceOf(Date);

    // E o devedor recebeu o valor de verdade, vindo do banco.
    expect(enviadas[0]).toContain("1.240,00");
  });

  // CPF inteiro no banco do inventário seria duplicar dado pessoal num segundo
  // sistema sem precisar — a máscara basta para conferir com quem está do outro
  // lado, e o devcod resolve o resto.
  it("o CPF completo NÃO é gravado em lugar nenhum", async () => {
    simular("identificar");
    await devedorDiz(`cpf ${CPF}, nascimento 12/04/1985`);

    const c = await prisma.conversa.findFirst();
    const tudo = JSON.stringify(c);
    expect(tudo).not.toContain(CPF);
    expect(tudo).toContain("529.***.***-25");
  });

  it("o CPF pendente é apagado quando a identificação fecha", async () => {
    simular("identificar");
    await devedorDiz(`meu cpf é ${CPF}`);
    expect((await prisma.conversa.findFirst())?.cpfPendente).toBe(CPF);

    simular("identificar");
    await devedorDiz("12/04/1985");
    const c = await prisma.conversa.findFirst();
    expect(c?.cpfPendente).toBeNull();
    expect(c?.identificadaEm).toBeInstanceOf(Date);
  });

  // O que o robô prometeu precisa chegar a quem assume: sem isso a operadora
  // contradiz a proposta na frente do devedor.
  it("a oferta feita fica gravada com valor, prazo e hora", async () => {
    simular("identificar");
    await devedorDiz(`${CPF} 12/04/1985`);

    const enviadas = simular("quer_negociar");
    await devedorDiz("da pra parcelar");

    const c = await prisma.conversa.findFirst();
    const o = JSON.parse(c!.oferta!) as {
      parcelas: number; valorParcela: number; descontoPercentual: number; em: string;
    };
    expect(o.parcelas).toBe(6);
    expect(o.valorParcela).toBe(206.67);
    expect(o.descontoPercentual).toBe(30);
    expect(new Date(o.em).getTime()).toBeGreaterThan(0);

    // E o que foi gravado é o MESMO que o devedor leu.
    expect(enviadas[0]).toContain("206,67");
    expect(enviadas[0]).toContain("6x");
  });

  it("carteira sem regra não grava oferta nenhuma", async () => {
    simular("identificar");
    await devedorDiz(`${CPF} 12/04/1985`);
    vi.mocked(regraDaCarteira).mockResolvedValue(null);

    simular("quer_negociar");
    await devedorDiz("tem desconto?");

    const c = await prisma.conversa.findFirst();
    expect(c?.oferta).toBeNull();
    expect(c?.situacao).toBe("fila");
    expect(c?.motivoEscalonamento).toMatch(/sem regra/);
  });

  // Banco fora do ar no meio da identificação: a conversa vai para gente com o
  // motivo escrito, e nada meio-gravado fica para trás.
  it("Siscobra fora do ar não deixa identificação pela metade", async () => {
    vi.mocked(identificar).mockResolvedValue({ achou: [], erro: true });
    simular("identificar");
    await devedorDiz(`${CPF} 12/04/1985`);

    const c = await prisma.conversa.findFirst();
    expect(c?.identificadaEm).toBeNull();
    expect(c?.siscobraDevcod).toBeNull();
    expect(c?.situacao).toBe("fila");
  });
});
