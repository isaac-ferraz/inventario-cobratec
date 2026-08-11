import { exigirChat } from "@/lib/autorizacao";
import { assinar, type EventoChat } from "@/lib/chat-eventos";

// GET /api/chat/eventos — canal aberto que avisa a tela quando chega mensagem.
//
// SSE (Server-Sent Events) e não WebSocket: o fluxo aqui é de mão única
// (servidor → tela), SSE é HTTP puro — passa pelo mesmo cookie de sessão, pela
// mesma CSP (`connect-src 'self'`) e pelo mesmo middleware, sem servidor
// separado nem biblioteca nova. WebSocket seria potência para um problema que
// não temos.
//
// O portão é o `exigirChat` de sempre: quem não é do ofício não escuta a fila.

// O canal fica aberto por horas; nada aqui pode ser pré-renderizado nem cacheado.
export const dynamic = "force-dynamic";

// Proxy e navegador cortam conexão parada. O comentário-ping (`:`) é o batimento
// que mantém o canal vivo sem virar evento na tela.
const PING_MS = 25_000;

export async function GET(req: Request): Promise<Response> {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const codificador = new TextEncoder();

  const stream = new ReadableStream({
    start(controle) {
      let vivo = true;
      const enviar = (texto: string) => {
        if (!vivo) return;
        try {
          controle.enqueue(codificador.encode(texto));
        } catch {
          // Cliente sumiu entre o aviso e a entrega: encerra sem barulho.
          encerrar();
        }
      };

      const cancelar = assinar((evento: EventoChat) => {
        enviar(`data: ${JSON.stringify(evento)}\n\n`);
      });

      const relogio = setInterval(() => enviar(": ping\n\n"), PING_MS);

      function encerrar() {
        if (!vivo) return;
        vivo = false;
        clearInterval(relogio);
        cancelar();
        try {
          controle.close();
        } catch {
          // já fechado
        }
      }

      // Limpeza é o ponto crítico deste arquivo: sem ela, cada aba fechada
      // deixaria para trás um ouvinte e um timer eternos — o vazamento clássico
      // de SSE, que só aparece depois de dias de uso.
      req.signal.addEventListener("abort", encerrar);

      // Primeiro byte imediato: sem ele, alguns proxies seguram a resposta
      // inteira esperando o corpo "terminar", e a tela nunca conecta.
      enviar(": conectado\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Desliga o buffer do nginx, se um dia houver um na frente.
      "x-accel-buffering": "no",
    },
  });
}
