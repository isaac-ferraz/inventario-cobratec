// A ligação com o modelo — Ollama, e nada além de classificar.
//
// ────────────────────── o que sobrou aqui, e por quê ──────────────────────
//
// Este arquivo já teve um robô inteiro: um prompt que ensinava tom, uma função
// que redigia a resposta e outra (`avaliarResposta`) que conferia o texto pronto
// procurando valor inventado, telefone inventado e promessa de atendente. Tudo
// isso saiu na decisão 32, e a remoção é o ponto:
//
// enquanto o modelo escrevia, cada medição achava uma invenção nova e cada
// correção era um remendo depois do fato. Quando ele passou a devolver só um
// rótulo (`classificar`), as travas de saída ficaram sem função — não há texto
// dele para conferir. O que chega ao devedor vem de `chat-respostas.ts`.
//
// Sobraram três coisas, e cada uma tem um dono claro:
//   • `configBot`/`ehLocal` — onde o modelo mora, e se isso é dentro da rede;
//   • `assuntoExigeGente`   — a trava de ENTRADA, por palavra, antes do modelo;
//   • `classificar`         — a única chamada ao modelo no caminho de produção.
//
// Em cobrança o preço de um número inventado não é constrangimento: é o CDC
// (art. 42), é contestação, é a empresa presa a uma promessa que não fez. Por
// isso a garantia deixou de depender de o modelo se comportar.

import {
  extrairDados,
  lerSaidaDoModelo,
  PROMPT_CLASSIFICADOR,
  type Leitura,
} from "@/lib/chat-intencao";

export type ConfigBot = {
  url: string;
  modelo: string;
  /** Segredo do proxy quando o modelo está fora da rede (Colab). */
  token: string | null;
};

// 3B em CPU responde em segundos, mas "segundos" varia com a máquina ocupada.
// O teto existe para o webhook não ficar pendurado: estourou, a conversa vai
// para a fila e uma pessoa atende — que é o pior caso aceitável deste módulo.
const TIMEOUT_MS = 45_000;

/** Config do robô, ou `null` quando ninguém ligou nenhum. */
export function configBot(): ConfigBot | null {
  const url = (process.env.OLLAMA_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    modelo: process.env.OLLAMA_MODELO?.trim() || "llama3.2",
    token: process.env.OLLAMA_TOKEN?.trim() || null,
  };
}

/**
 * O modelo está dentro da rede da empresa?
 *
 * Existe por causa do caminho do Colab (decisão 31.1): apontar `OLLAMA_URL`
 * para um túnel público muda o que acontece com a fala do devedor — ela passa a
 * sair da empresa. Isso não pode ser invisível na tela do TI, e a tela não pode
 * afirmar "roda nesta rede" só porque existe robô ligado.
 *
 * Endereço que a internet não alcança conta como local: loopback, faixas
 * privadas, `host.docker.internal` e nome de container (sem ponto). O resto é
 * fora — inclusive um IP público da própria empresa, e está certo assim: quem
 * expôs o Ollama na internet tomou a mesma decisão de quem usa o Colab.
 */
export function ehLocal(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false; // URL que nem parseia não vai ser chamada de segura.
  }

  if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
  if (host === "host.docker.internal" || host.endsWith(".local")) return true;
  // Nome de container/host da LAN: `cobratec-waha`, `servidor-ti`.
  if (!host.includes(".") && !host.includes(":")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  return false;
}

// ─────────────── o que nem chega a ser perguntado ao modelo ───────────────

/**
 * Assuntos que vão para gente SEM passar pelo modelo.
 *
 * Esta lista já foi bem maior, e **encolher foi o conserto**. Ela nasceu na
 * decisão 31, quando o robô redigia: naquele desenho, qualquer assunto que
 * encostasse em dinheiro era perigoso, porque o modelo inventava o número.
 * Barrar "dívida", "parcelar", "desconto" e "cpf" era o que impedia o estrago.
 *
 * Com a decisão 32 o modelo parou de escrever — e a lista virou uma armadilha:
 * ela bloqueava justamente o que o robô passou a saber fazer. "Meu CPF é..."
 * batia em `\bcpf\b` e ia para a fila, então a identificação nunca acontecia;
 * "dá pra parcelar" batia em `parcel`, então a oferta nunca era feita. O robô
 * novo estava desligado na prática, e os testes de unidade não viam porque
 * chamam `decidir` direto, pulando esta função. Quem pegou foi o teste de rota.
 *
 * O critério mudou junto. Antes era "o modelo pode inventar aqui?". Agora é
 * **"existe molde honesto para isto?"** — e onde não existe, quem responde é
 * gente, mesmo que o modelo classifique com toda a confiança do mundo:
 *
 *   • pagamento alegado  — o robô não consegue conferir baixa no CRM;
 *   • jurídico           — advogado, Procon, processo;
 *   • contestação        — "não é minha", golpe, fraude;
 *   • dado bancário      — quem começa a mandar cartão/conta está perdido, e
 *                          nenhum molde nosso pede isso;
 *   • horário e endereço — fatos que o CÓDIGO também não tem.
 */
const ASSUNTO_DE_GENTE: Array<[RegExp, string]> = [
  [/\bj[áa]\s+paguei|\bpaguei\b|\bpagamento\s+feito|comprovante/i, "diz que pagou"],
  [/advogad|procon|process|justi[çc]a|juizado|reclame\s*aqui/i, "menção jurídica"],
  [/gol[pe]|fraude|n[ãa]o\s+(é|e)\s+minha|n[ãa]o\s+reconhe[çc]|engano/i, "contesta a cobrança"],
  [/\bconta\b\s+banc|cart[ãa]o\s+de\s+cr[ée]dito|n[úu]mero\s+do\s+cart[ãa]o/i, "ofereceu dado bancário"],
  // Medido: perguntado se atendia sábado, o 1B respondeu "Não, não atendemos
  // sábados" — inventado. Informação errada dada pela empresa é problema mesmo
  // quando não é sobre dinheiro, e aqui não há molde possível: o código não
  // sabe o horário.
  [
    /hor[áa]rio|que\s+horas|atendem?\s|funcionam?\s|endere[çc]o|onde\s+fica|telefone|ligar\s+para/i,
    "pergunta operacional sobre a empresa",
  ],
];

/**
 * O assunto exige gente? Devolve o motivo, ou `null` quando o robô pode tentar.
 */
export function assuntoExigeGente(texto: string): string | null {
  const limpo = (texto ?? "").trim();
  if (!limpo) return null;
  for (const [padrao, motivo] of ASSUNTO_DE_GENTE) {
    if (padrao.test(limpo)) return motivo;
  }
  return null;
}

export type FalaDaThread = { autor: string; corpo: string };

/**
 * Pergunta ao modelo **só a intenção** da última fala (decisão 32).
 *
 * É o que substituiu `pensar` no caminho de produção. A diferença não é de
 * grau: ali o modelo escrevia o que o devedor lia, aqui ele devolve uma palavra
 * de uma lista de doze e o texto vem de molde. Todo o esforço de barrar valor
 * inventado, telefone inventado e promessa de atendente deixou de ser
 * necessário — não há por onde.
 *
 * Qualquer falha (modelo fora do ar, formato quebrado, rótulo desconhecido)
 * termina em `outro`, e `outro` é gente. O caminho do erro é o caminho seguro.
 */
export async function classificar(
  cfg: ConfigBot,
  historico: FalaDaThread[],
  ultimaFala: string,
): Promise<Leitura> {
  // `respondeu: false` é o que distingue "o modelo disse que não sabe" de "o
  // modelo não disse nada". Os dois vão para gente; só um deles é problema de
  // infraestrutura, e a operadora precisa saber qual.
  const paraGente: Leitura = {
    intencao: "outro",
    ...extrairDados(ultimaFala),
    parcelas: null,
    respondeu: false,
  };

  const mensagens = [
    { role: "system", content: PROMPT_CLASSIFICADOR },
    // Só as últimas falas: para classificar a intenção de AGORA, conversa longa
    // atrapalha mais do que ajuda num modelo pequeno.
    ...historico.slice(-6).map((f) => ({
      role: f.autor === "devedor" ? "user" : "assistant",
      content: f.corpo.slice(0, 500),
    })),
  ];

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.modelo,
        messages: mensagens,
        stream: false,
        format: "json",
        keep_alive: "30m",
        options: {
          temperature: 0,
          // Um rótulo e um número cabem em 40. Classificar não precisa de
          // fôlego, e teto baixo é resposta mais rápida para quem espera.
          num_predict: 40,
        },
      }),
      signal: controle.signal,
    });

    if (!res.ok) return paraGente;

    const corpo = (await res.json().catch(() => null)) as {
      message?: { content?: unknown };
    } | null;
    const conteudo = corpo?.message?.content;
    if (typeof conteudo !== "string") return paraGente;

    return lerSaidaDoModelo(conteudo, ultimaFala);
  } catch {
    return paraGente;
  } finally {
    clearTimeout(relogio);
  }
}
