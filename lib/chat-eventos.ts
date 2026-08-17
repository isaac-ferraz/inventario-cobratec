// Aviso de conversa nova, em tempo real.
//
// Antes disto a fila recarregava a cada 15s. Para um escritório é pouco tempo no
// relógio e muito na prática: quem atende fica com a aba num monitor lateral, e
// um devedor esperando quinze segundos sem nada piscando é um devedor que
// ninguém viu. O custo também não era zero — uma consulta a cada 15s por aba
// aberta, o dia inteiro, para quase sempre responder "nada mudou".
//
// ─────────────────────────── por que em memória ───────────────────────────
//
// Um barramento de processo: quem escreve (o webhook) publica, quem olha (a
// tela) assina. Sem Redis, sem tabela de fila, sem dependência nova — o mesmo
// espírito do SQLite deste projeto.
//
// O LIMITE, dito antes que alguém tropece nele: isto só funciona porque o app
// roda em UM processo. Com duas instâncias atrás de um balanceador, o aviso
// nasceria numa e a tela estaria pendurada na outra. Quando isso acontecer, o
// conserto é trocar este arquivo por um canal de verdade (Redis pub/sub) — a
// tela não muda, porque ela só conhece o SSE.
//
// Por isso a consulta periódica CONTINUA existindo na tela, mais lenta: se o
// aviso não chegar, o pior caso volta a ser "a fila demora um pouco", e não
// "a fila congelou".

export type EventoChat = {
  /** "mensagem" (chegou algo do devedor) ou "ping" (o canal está vivo). */
  tipo: "mensagem" | "ping";
  conversaId?: string;
};

type Ouvinte = (evento: EventoChat) => void;

const ouvintes = new Set<Ouvinte>();

/** Assina os avisos. Devolve a função que cancela — chame-a SEMPRE no fim. */
export function assinar(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * Avisa todo mundo que está olhando.
 *
 * Nunca lança: um ouvinte quebrado (aba que fechou no meio da entrega) não pode
 * derrubar a gravação da mensagem que o originou. O webhook responde ao gateway
 * de qualquer jeito.
 */
export function publicar(evento: EventoChat): void {
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(evento);
    } catch {
      // ouvinte morto: o cancelamento dele já está a caminho
    }
  }
}

/** Quantas telas estão ouvindo — usado nos testes para provar que não vaza. */
export function totalDeOuvintes(): number {
  return ouvintes.size;
}
