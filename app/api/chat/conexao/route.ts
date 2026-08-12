import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import {
  conectar,
  configWaha,
  desconectar,
  parar,
  statusSessao,
  type SessaoWaha,
} from "@/lib/waha";
import { configBot } from "@/lib/chat-bot";

// Conexão do número de WhatsApp — parear, conferir e desligar.
//
// SÓ ADMIN, e não a operadora de cobrança: quem atende usa a linha, quem liga a
// linha é o TI. É a mesma divisão de /usuarios e do catálogo — a operadora não
// derruba a conexão da equipe inteira com um clique errado.
//
// Existe apenas no modo direto (decisão 29). Com o n8n no meio (produção) quem
// conhece o gateway é o fluxo do n8n, e esta tela não tem o que mostrar.

type Estado = {
  modo: "direto" | "n8n" | "desligado";
  /** Falta configuração para o modo direto funcionar? Qual? */
  pendencias: string[];
  sessao: SessaoWaha | null;
  /** Endereço que o gateway usa para avisar este app. */
  webhookUrl: string | null;
  /**
   * Tem robô local triando (decisão 31)? A tela precisa saber porque o destino
   * de quem escreve muda: com robô a conversa começa COM ELE, sem robô toda
   * mensagem cai na fila. Dizer a coisa errada aqui faria o TI procurar defeito
   * onde está a configuração.
   *
   * Só o nome do modelo — o endereço do Ollama é infraestrutura e não ajuda
   * quem olha a tela.
   */
  robo: { ligado: boolean; modelo: string | null };
  erro: string | null;
};

function estadoDoRobo(): Estado["robo"] {
  const cfg = configBot();
  return { ligado: !!cfg, modelo: cfg?.modelo ?? null };
}

function pendenciasDe(temWaha: boolean): string[] {
  const faltando: string[] = [];
  if (!temWaha) faltando.push("WAHA_URL");
  if (!process.env.CHAT_SERVICE_TOKEN) faltando.push("CHAT_SERVICE_TOKEN");
  return faltando;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const cfg = configWaha();

  // Com o n8n configurado ele manda: o modo direto é o caminho de teste, e
  // ligar os dois faria a resposta da operadora sair por dois canais.
  if (process.env.CHAT_ENVIO_URL) {
    return NextResponse.json<Estado>({
      modo: "n8n",
      pendencias: [],
      sessao: null,
      webhookUrl: null,
      // Com o n8n no meio, quem responde é o robô dele — o local não opera.
      robo: { ligado: false, modelo: null },
      erro: null,
    });
  }

  if (!cfg) {
    return NextResponse.json<Estado>({
      modo: "desligado",
      pendencias: pendenciasDe(false),
      sessao: null,
      webhookUrl: null,
      robo: estadoDoRobo(),
      erro: null,
    });
  }

  const r = await statusSessao(cfg);
  return NextResponse.json<Estado>({
    modo: "direto",
    pendencias: pendenciasDe(true),
    sessao: r.ok ? r.dados : null,
    webhookUrl: cfg.webhookUrl,
    robo: estadoDoRobo(),
    erro: r.ok ? null : r.motivo,
  });
}

const ACOES = ["conectar", "parar", "desconectar"] as const;
type Acao = (typeof ACOES)[number];

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const cfg = configWaha();
  if (!cfg) {
    return erro(
      "Modo direto não configurado (WAHA_URL ausente). Nada foi feito.",
      503,
    );
  }
  // Sem o segredo o gateway até parearia, mas o webhook chegaria sem
  // `Authorization` e toda mensagem do devedor bateria em 401 — conexão que
  // recebe e joga fora é pior que conexão que não sobe.
  if (!process.env.CHAT_SERVICE_TOKEN) {
    return erro(
      "Defina CHAT_SERVICE_TOKEN antes de conectar: sem ele o gateway não consegue entregar as mensagens recebidas.",
      503,
    );
  }

  const corpo = (await req.json().catch(() => null)) as { acao?: unknown } | null;
  const acao = corpo?.acao;
  if (!ACOES.includes(acao as Acao)) {
    return erro("Ação deve ser conectar, parar ou desconectar.");
  }

  if (acao === "conectar") {
    const r = await conectar(cfg);
    if (!r.ok) return erro(r.motivo, r.status);
    return NextResponse.json({ ok: true, sessao: r.dados });
  }

  const r = acao === "parar" ? await parar(cfg) : await desconectar(cfg);
  if (!r.ok) return erro(r.motivo, r.status);
  return NextResponse.json({ ok: true });
}
