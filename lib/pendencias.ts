// Pendências de cadastro de um computador — o que falta registrar.
//
// Uma lista só, usada em dois lugares que PRECISAM concordar: o Dashboard conta
// e a tela de Computadores filtra. Se cada um tivesse a sua regra, o card diria
// "7" e a lista abriria com 6 — e o número perderia a credibilidade.

/** Computador visto por uma pendência: só os campos que importam aqui. */
export type Verificavel = {
  salaId?: string | null;
  licencaWindows?: string | null;
  licencaMicrosoft?: string | null;
  contaOutlook?: string | null;
  loginPadrao?: string | null;
  temHeadset?: boolean;
};

export type Pendencia = {
  /** Vai na URL: /computadores?pendencia=<chave> */
  chave: string;
  rotulo: string;
  falta: (c: Verificavel) => boolean;
};

// Campo de texto em branco conta como ausente: `""` no banco significa a mesma
// coisa que null para quem está conferindo a máquina.
const vazio = (v: string | null | undefined) => !v || v.trim() === "";

export const PENDENCIAS: Pendencia[] = [
  {
    chave: "sem-sala",
    rotulo: "Sem sala definida",
    falta: (c) => !c.salaId,
  },
  {
    chave: "sem-licenca-windows",
    rotulo: "Sem licença Windows",
    falta: (c) => vazio(c.licencaWindows),
  },
  {
    chave: "sem-licenca-microsoft",
    rotulo: "Sem licença Microsoft / Office",
    falta: (c) => vazio(c.licencaMicrosoft),
  },
  {
    chave: "sem-conta-outlook",
    rotulo: "Sem conta Outlook",
    falta: (c) => vazio(c.contaOutlook),
  },
  {
    chave: "sem-login-padrao",
    rotulo: "Sem login padrão",
    falta: (c) => vazio(c.loginPadrao),
  },
  {
    chave: "sem-headset",
    rotulo: "Sem headset",
    falta: (c) => c.temHeadset === false,
  },
];

export function acharPendencia(chave: string | null | undefined) {
  return PENDENCIAS.find((p) => p.chave === chave);
}

/** Conta quantos computadores estão com cada pendência (para o Dashboard). */
export function contarPendencias(
  computadores: Verificavel[],
): { chave: string; rotulo: string; valor: number }[] {
  return PENDENCIAS.map((p) => ({
    chave: p.chave,
    rotulo: p.rotulo,
    valor: computadores.filter(p.falta).length,
  }));
}
