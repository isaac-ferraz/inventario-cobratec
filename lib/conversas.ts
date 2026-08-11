// Regras do atendimento ao devedor — funções PURAS, sem banco.
//
// Mesmo lugar e mesmo motivo de `lib/chamados.ts`: quem pode ver, quem pode
// falar e para onde a conversa pode ir são o coração do módulo, e sendo puras
// dá para testá-las exaustivamente sem subir n8n, gateway nem banco.
//
// Uma diferença importante em relação ao helpdesk: aqui existe um TERCEIRO ator
// que não é usuário do sistema — o robô. As regras abaixo tratam "o robô está
// conduzindo" como um estado da conversa, não como uma permissão de alguém.

import type { Papel } from "@/lib/supervisao";
export type { Papel } from "@/lib/supervisao";

export const SITUACOES = ["bot", "fila", "humana", "encerrada"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  bot: "Com o robô",
  fila: "Esperando atendente",
  humana: "Em atendimento",
  encerrada: "Encerrada",
};

export const AUTORES = ["devedor", "bot", "operadora", "sistema"] as const;
export type Autor = (typeof AUTORES)[number];

/** Conversas que ainda pedem alguma coisa de alguém — KPI e filtro "abertas". */
export const SITUACOES_ABERTAS: Situacao[] = ["bot", "fila", "humana"];

export function estaAberta(situacao: string): boolean {
  return (SITUACOES_ABERTAS as string[]).includes(situacao);
}

export function ehSituacao(v: unknown): v is Situacao {
  return typeof v === "string" && (SITUACOES as readonly string[]).includes(v);
}

// ─────────────────────────── quem alcança o quê ───────────────────────────

/**
 * Quem enxerga conversa com devedor. Espelha `exigirChat` (lib/autorizacao.ts):
 * administrador e cobrança, mais ninguém.
 *
 * O SUPERVISOR de sala fica de fora de propósito (decisão 27) — e é por isso
 * que esta função existe em vez de reaproveitar `lib/supervisao.ts`: lá a
 * pergunta é "isto pertence a uma sala minha?", e conversa com devedor não
 * pertence a sala nenhuma.
 */
export function alcancaConversas(papel: Papel): boolean {
  return papel === "ADMIN" || papel === "COBRANCA";
}

/**
 * Uma operadora responde apenas nas conversas que ASSUMIU; o admin fala em
 * qualquer uma.
 *
 * A trava não é hierarquia, é atendimento: duas pessoas escrevendo no mesmo
 * WhatsApp produzem respostas que se contradizem na frente do devedor — e em
 * cobrança isso vira contestação. Quem assumiu, responde.
 */
export function podeFalar(
  papel: Papel,
  situacao: string,
  responsavelId: string | null,
  usuarioId: string,
): ResultadoAcao {
  if (situacao === "encerrada") {
    return { permitido: false, motivo: "Esta conversa está encerrada." };
  }
  if (situacao !== "humana") {
    return {
      permitido: false,
      motivo: "Assuma a conversa antes de responder ao devedor.",
    };
  }
  if (papel === "ADMIN") return { permitido: true };
  if (responsavelId !== usuarioId) {
    return {
      permitido: false,
      motivo: "Esta conversa está com outra atendente.",
    };
  }
  return { permitido: true };
}

export type ResultadoAcao =
  | { permitido: true }
  | { permitido: false; motivo: string };

// ─────────────────────────── transições ───────────────────────────

/**
 * Para onde a conversa pode ir a partir de onde está.
 *
 * O desenho tem uma direção só que importa: **do robô para a pessoa é sempre
 * possível; da pessoa de volta para o robô, não.** Depois que um humano falou
 * com o devedor, devolver a conversa para a máquina no meio do assunto é a
 * receita para o robô contradizer o que a atendente acabou de prometer. Voltar
 * ao robô exige encerrar e o devedor escrever de novo — aí é outro atendimento.
 */
const TRANSICOES: Record<Situacao, Situacao[]> = {
  bot: ["fila", "humana", "encerrada"],
  fila: ["humana", "encerrada"],
  // Sem "bot" aqui, e é a regra mais importante desta tabela.
  humana: ["fila", "encerrada"],
  // Devedor que escreve de novo reabre pelo webhook, não pela tela.
  encerrada: [],
};

export function podeMudarSituacao(atual: string, nova: string): ResultadoAcao {
  if (!ehSituacao(nova)) {
    return { permitido: false, motivo: "Situação inválida." };
  }
  if (!ehSituacao(atual)) {
    return { permitido: false, motivo: "Situação atual desconhecida." };
  }
  if (atual === nova) return { permitido: true };

  if (!TRANSICOES[atual].includes(nova)) {
    if (atual === "encerrada") {
      return {
        permitido: false,
        motivo:
          "Conversa encerrada. Ela reabre sozinha se o devedor escrever de novo.",
      };
    }
    if (nova === "bot") {
      return {
        permitido: false,
        motivo:
          "Não dá para devolver ao robô uma conversa que já teve atendimento humano — encerre em vez disso.",
      };
    }
    return { permitido: false, motivo: "Transição não permitida." };
  }
  return { permitido: true };
}

// ─────────────────────────── o que o robô pode dizer ───────────────────────

/**
 * O devedor está identificado? Exige `devcod` **e** a marca de quando a
 * identificação aconteceu.
 *
 * Os dois juntos, e não só o código, porque `siscobraDevcod` pode ter sido
 * preenchido por um palpite do n8n (telefone que casa com um cadastro), e
 * palpite não é identificação. `identificadaEm` só é gravado depois da dupla
 * verificação CPF + data de nascimento.
 */
export function estaIdentificada(conversa: {
  siscobraDevcod: number | null;
  identificadaEm: Date | null;
}): boolean {
  return conversa.siscobraDevcod !== null && conversa.identificadaEm !== null;
}

/**
 * A trava central do domínio: **valor só sai depois da identificação.**
 *
 * Cobrança é área regulada (CDC art. 42 e 71, LGPD). Dizer saldo, desconto ou
 * proposta para quem não provou ser o devedor é vazamento de dado pessoal para
 * terceiro — e basta o número ter trocado de dono. Por isso a regra é de
 * código, e não de prompt: prompt é sugestão, e um modelo que alucina não
 * consulta o CLAUDE.md antes de responder.
 *
 * Vale para o robô. A operadora humana responde pelo que diz.
 */
export function podeRevelarValores(conversa: {
  siscobraDevcod: number | null;
  identificadaEm: Date | null;
}): boolean {
  return estaIdentificada(conversa);
}

/**
 * A proposta cabe na regra oficial da carteira?
 *
 * `acordo_regras` / `acordo_regras_parcela` do Siscobra são o documento oficial
 * do parcelamento: quantas parcelas o operador pode dar, valor mínimo de
 * parcela e teto de desconto. O robô só fecha DENTRO disso; qualquer coisa
 * fora vira escalonamento para gente, nunca uma exceção decidida pela máquina.
 *
 * Regra ausente (a maioria das carteiras não tem uma ativa) devolve `false`:
 * sem documento oficial, o robô não inventa condição — escala.
 */
export type RegraCarteira = {
  maxParcelas: number | null;
  valorMinimoParcela: number | null;
  descontoMaximoPercentual: number | null;
};

export type Proposta = {
  parcelas: number;
  valorParcela: number;
  descontoPercentual: number;
};

export function propostaCabeNaRegra(
  proposta: Proposta,
  regra: RegraCarteira | null,
): ResultadoAcao {
  if (!regra) {
    return {
      permitido: false,
      motivo: "Esta carteira não tem regra de parcelamento cadastrada.",
    };
  }
  if (proposta.parcelas < 1) {
    return { permitido: false, motivo: "Proposta sem parcelas." };
  }
  if (regra.maxParcelas !== null && proposta.parcelas > regra.maxParcelas) {
    return {
      permitido: false,
      motivo: `A regra da carteira permite até ${regra.maxParcelas} parcelas.`,
    };
  }
  if (
    regra.valorMinimoParcela !== null &&
    proposta.valorParcela < regra.valorMinimoParcela
  ) {
    return {
      permitido: false,
      motivo: `A parcela mínima da carteira é R$ ${regra.valorMinimoParcela.toFixed(2)}.`,
    };
  }
  if (
    regra.descontoMaximoPercentual !== null &&
    proposta.descontoPercentual > regra.descontoMaximoPercentual
  ) {
    return {
      permitido: false,
      motivo: `O desconto máximo da carteira é ${regra.descontoMaximoPercentual}%.`,
    };
  }
  return { permitido: true };
}

// ─────────────────────────── telefone ───────────────────────────

/**
 * Normaliza o telefone para a identidade da conversa: só dígitos, com o 55 do
 * Brasil na frente.
 *
 * Existe porque o mesmo devedor chega escrito de N jeitos — "+55 (12) 99765-4321"
 * pelo gateway, "12997654321" digitado pela operadora — e cada variação criaria
 * uma conversa nova, quebrando o histórico no meio do atendimento.
 *
 * O nono dígito NÃO é inventado nem removido: fixo e celular antigo existem, e
 * adivinhar aqui juntaria conversas de números diferentes. Quem manda é o que o
 * gateway entregou.
 *
 * LIMITE CONHECIDO, assumido: 10 ou 11 dígitos é tratado como brasileiro sem
 * código de país. Um número estrangeiro digitado nessa faixa (um americano
 * "1 415 555 2671" tem 11) sairia daqui com um 55 indevido na frente. Fica
 * assim de propósito — não há como distinguir os dois só olhando os dígitos, a
 * carteira da Cobratec é brasileira, e o caminho que realmente importa não
 * passa por adivinhação: o WhatsApp entrega o JID já em E.164
 * ("5512997654321@c.us"), então número vindo do gateway cai na primeira regra.
 * A prefixação existe para o que a operadora digita à mão.
 */
export function normalizarTelefone(bruto: string): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  // 12+ dígitos = já tem código de país (brasileiro ou não): passa inteiro.
  if (digitos.length >= 12) return digitos;
  // 10 (fixo com DDD) ou 11 (celular com DDD): brasileiro digitado à mão.
  return `55${digitos}`;
}

/** "5512997654321" → "(12) 99765-4321", para a tela. */
export function formatarTelefone(e164: string): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  const semPais = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  }
  return e164;
}
