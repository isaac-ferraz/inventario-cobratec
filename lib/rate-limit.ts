// Limite de tentativas por janela de tempo — contador em memória.
//
// POR QUE EM MEMÓRIA: o app roda como uma instância única na LAN (um container),
// e o caso real é alguém insistindo no formulário de login. Um Map resolve isso
// sem trazer Redis nem dependência nova (CLAUDE.md — projeto enxuto). Se um dia
// houver mais de uma instância, cada uma contaria em separado e o teto efetivo
// seria N × máximo: aí isto precisa virar contador compartilhado.
//
// Reiniciar o processo zera os contadores. É aceitável: quem está adivinhando
// senha não derruba o servidor para ganhar mais tentativas.

type Janela = { inicio: number; tentativas: number };

const janelas = new Map<string, Janela>();

export type Veredito = {
  permitido: boolean;
  /** Segundos até a janela virar — vai no Retry-After. */
  esperarS: number;
};

/**
 * Conta uma tentativa e diz se ela pode seguir. Chame ANTES de fazer o trabalho
 * caro (ler o banco, comparar hash).
 */
export function registrarTentativa(
  chave: string,
  maximo: number,
  janelaMs: number,
  agora = Date.now(),
): Veredito {
  const j = janelas.get(chave);

  if (!j || agora - j.inicio >= janelaMs) {
    janelas.set(chave, { inicio: agora, tentativas: 1 });
    return { permitido: true, esperarS: 0 };
  }

  j.tentativas += 1;
  if (j.tentativas > maximo) {
    return {
      permitido: false,
      esperarS: Math.max(1, Math.ceil((janelaMs - (agora - j.inicio)) / 1000)),
    };
  }
  return { permitido: true, esperarS: 0 };
}

/** Sucesso limpa o histórico: quem acertou a senha não fica de castigo. */
export function limparTentativas(chave: string): void {
  janelas.delete(chave);
}

/**
 * Descarta janelas vencidas. Sem isto o Map cresceria indefinidamente num
 * processo de vida longa (cada login errado com usuário diferente é uma chave).
 */
export function podarJanelas(janelaMs: number, agora = Date.now()): void {
  for (const [chave, j] of janelas) {
    if (agora - j.inicio >= janelaMs) janelas.delete(chave);
  }
}

/** Só para teste: devolve o contador a zero. */
export function zerarTudo(): void {
  janelas.clear();
}
