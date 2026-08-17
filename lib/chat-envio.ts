// Entrega da resposta da operadora ao devedor.
//
// Dois caminhos, e a ordem entre eles não é acidental:
//
//   1. `CHAT_ENVIO_URL` — o webhook do n8n. É a PRODUÇÃO (decisão 28): o
//      inventário não fala com gateway nenhum, e o n8n é quem sabe qual está
//      ligado, qual sessão usar e como formatar: a integração com o WhatsApp
//      mora num lugar só.
//
//      (Este argumento já valeu também para o Siscobra, e não vale mais: a
//      decisão 32 trouxe a leitura do CRM para dentro do app. A diferença é que
//      ler saldo é uma consulta parametrizada e fixa; falar com gateway de
//      WhatsApp é sessão, pareamento e formato que mudam com o fornecedor.)
//
//      Trocar de gateway amanhã é mexer no fluxo do n8n — sem migration, sem
//      deploy do inventário, sem tocar em código de autenticação.
//
//   2. `WAHA_URL` — o gateway direto. É o TESTE (decisão 29), para parear um
//      número e ver a conversa acontecer antes de existir fluxo de n8n.
//
// O n8n VENCE quando os dois estão configurados. Se o modo direto ganhasse, uma
// variável esquecida no .env silenciaria o chatbot inteiro — e ninguém
// perceberia até o devedor reclamar que ninguém respondeu.
import { configWaha, enviarTexto } from "@/lib/waha";

export type Entrega =
  | { ok: true; waId: string | null }
  | { ok: false; motivo: string; status: number };

// Rede de escritório com internet instável: sem teto, a operadora ficaria com a
// tela travada sem saber se mandou ou não.
const TIMEOUT_MS = 15_000;

export async function enviarPeloGateway(
  telefone: string,
  corpo: string,
): Promise<Entrega> {
  const url = process.env.CHAT_ENVIO_URL;
  const token = process.env.CHAT_SERVICE_TOKEN;

  if (!url) {
    const cfg = configWaha();
    if (cfg) {
      const r = await enviarTexto(cfg, telefone, corpo);
      return r.ok
        ? { ok: true, waId: r.dados.waId }
        : {
            ok: false,
            status: r.status === 422 ? 503 : r.status,
            // O WAHA explica bem a recusa mais comum ("Session status is not as
            // expected") — repassar é o que faz o TI ir parear o número em vez
            // de procurar defeito no app. A pontuação é acertada porque a frase
            // do gateway vem em inglês e sem ponto final.
            motivo: `${pontuar(r.motivo)} A mensagem NÃO foi enviada.`,
          };
    }

    // 503 e não 500: não é defeito, é serviço não ligado — e a mensagem diz
    // exatamente o que falta, para o TI não caçar bug onde falta configuração.
    return {
      ok: false,
      status: 503,
      motivo:
        "Serviço de conversas não configurado (defina CHAT_ENVIO_URL, do n8n, ou WAHA_URL, do gateway direto). A mensagem NÃO foi enviada.",
    };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ telefone, corpo }),
      signal: controle.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        motivo: `O WhatsApp recusou o envio (${res.status}). A mensagem NÃO foi enviada.`,
      };
    }

    // O `waId` é opcional de propósito: nem todo gateway devolve o id da
    // mensagem, e o envio não pode falhar por causa disso. Quando vem, serve
    // para o webhook de eco não duplicar a mesma fala na thread.
    const corpoResposta = (await res.json().catch(() => null)) as {
      waId?: unknown;
      id?: unknown;
    } | null;
    const waId = corpoResposta?.waId ?? corpoResposta?.id;

    return { ok: true, waId: typeof waId === "string" ? waId : null };
  } catch (e) {
    const abortou = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      status: 504,
      motivo: abortou
        ? "O serviço de conversas não respondeu a tempo. A mensagem NÃO foi enviada."
        : "Não foi possível falar com o serviço de conversas. A mensagem NÃO foi enviada.",
    };
  } finally {
    clearTimeout(relogio);
  }
}

function pontuar(texto: string): string {
  const t = texto.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
