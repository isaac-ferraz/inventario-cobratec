// Tudo que o devedor lê do robô nasce aqui.
//
// Nenhuma destas frases passou por um modelo. Elas são moldes preenchidos com
// campo do banco — e é isso, e só isso, que sustenta a promessa de que o robô
// não inventa valor, data nem nome. A promessa não é sobre o modelo se comportar
// bem: é sobre ele não ter por onde falar.
//
// Consequência prática de escrever assim: este arquivo é o TOM da empresa, num
// lugar só, revisável por gente que não programa. Mudar como o robô fala é
// mudar texto aqui, não afinar prompt e torcer.
//
// Regra ao editar: nunca interpolar valor que não venha de um campo do Siscobra
// ou de um cálculo conferido por `lib/conversas.ts`. Se você precisar escrever
// um número à mão numa frase, algo está errado no caminho, não no texto.

/** Dinheiro em português, sempre com os centavos. */
export function reais(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/** `2025-03-12` (ou Date) → `12/03/2025`. */
export function dataBr(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const t = typeof v === "string" ? v : v.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

const ola = (nome: string | null) => (nome ? `Olá, ${nome}! ` : "Olá! ");

export const RESPOSTAS = {
  // ── entrada ──────────────────────────────────────────────────────────────
  saudacao: (nome: string | null) =>
    `${ola(nome)}Aqui é a Cobratec. Posso ajudar com sua negociação por aqui mesmo.`,

  /**
   * O pedido de identificação diz POR QUE pede.
   *
   * Devedor desconfia de quem pede CPF no WhatsApp, e com razão — é o formato
   * clássico do golpe. Dizer que é para proteger o dado dele, e não para
   * liberar o nosso sistema, é a diferença entre cooperar e bloquear o número.
   */
  pedirIdentificacao: () =>
    "Para eu falar de valores preciso ter certeza de que é você mesmo — é a " +
    "regra que protege seus dados. Pode me enviar seu CPF e sua data de " +
    "nascimento?",

  faltaNascimento: () => "Recebi o CPF. Agora me diga sua data de nascimento, por favor.",
  faltaCpf: () => "Recebi a data de nascimento. Agora me envie seu CPF, por favor.",

  cpfInvalido: () =>
    "Esse CPF não parece completo. Pode conferir e mandar os 11 números?",

  naoEncontrado: () =>
    "Não localizei um cadastro com esses dados. Vou chamar uma atendente para " +
    "verificar com você.",

  // ── valores (só depois de identificado) ───────────────────────────────────
  saldo: (d: { nome: string | null; saldo: number; vencidoDesde: string | null }) => {
    const base = `${ola(d.nome)}Localizei seu cadastro. O valor em aberto é ${reais(d.saldo)}`;
    return d.vencidoDesde
      ? `${base}, com vencimento desde ${d.vencidoDesde}.`
      : `${base}.`;
  },

  varios: (n: number) =>
    `Encontrei ${n} contratos em aberto no seu nome. Vou passar para uma ` +
    `atendente organizar isso com você.`,

  // ── negociação, dentro da regra oficial ───────────────────────────────────
  /**
   * A oferta é montada a partir de `acordo_regras`, e o cálculo é conferido por
   * `propostaCabeNaRegra` antes de virar texto. Nenhum número aqui foi escolhido
   * por esta função — ela só formata o que o banco autorizou.
   */
  oferta: (o: {
    saldo: number;
    parcelas: number;
    valorParcela: number;
    descontoPercentual: number;
    valorAVista: number;
  }) => {
    const linhas = [
      `Pelas condições da sua carteira eu consigo:`,
      ``,
      `• à vista: ${reais(o.valorAVista)}` +
        (o.descontoPercentual > 0 ? ` (${o.descontoPercentual}% de desconto)` : ``),
      `• em até ${o.parcelas}x de ${reais(o.valorParcela)}`,
      ``,
      `Alguma dessas serve para você?`,
    ];
    return linhas.join("\n");
  },

  semRegra: () =>
    "Para negociar essa dívida vou chamar uma atendente — ela tem as condições " +
    "certas para o seu caso.",

  foraDaRegra: (maxParcelas: number | null) =>
    maxParcelas
      ? `Nessa quantidade de parcelas eu não consigo fechar sozinha (o máximo ` +
        `aqui é ${maxParcelas}x). Vou chamar uma atendente para ver seu caso.`
      : `Essa condição eu não consigo fechar sozinha. Vou chamar uma atendente.`,

  aceitou: () =>
    "Ótimo! Vou passar para uma atendente registrar o acordo e te enviar o " +
    "documento com as datas. É rapidinho.",

  recusou: () =>
    "Entendo. Vou chamar uma atendente para ver o que dá para fazer no seu caso.",

  boleto: () =>
    "Vou chamar uma atendente para gerar isso para você agora.",

  /**
   * A resposta que só existe porque o texto virou molde.
   *
   * Perguntado o que a Cobratec faz, o 3B respondia "empresa de tecnologia" e o
   * 1B chegou a "um serviço de pagamento da Receita Federal" — por isso a
   * pergunta era escalada (decisão 31.2). Aqui ela é uma string fixa, e string
   * fixa não inventa. É o desenho da decisão 32 devolvendo ao robô algo que ele
   * tinha perdido.
   */
  sobreEmpresa: () =>
    "A Cobratec é uma empresa de cobrança. Falo com você sobre contas em " +
    "atraso e posso ajudar a resolver isso por aqui mesmo.",

  // ── saída ────────────────────────────────────────────────────────────────
  despedida: () => "Obrigada pelo contato! Qualquer coisa é só chamar. 🌤️",

  /**
   * O aviso de que uma pessoa vai entrar. Existe porque silêncio depois de
   * "vou chamar alguém" é onde o devedor desiste — ele não sabe se foi ouvido.
   */
  chamandoGente: () =>
    "Só um momento que uma atendente entra aqui na conversa.",
} as const;

/**
 * Calcula a oferta a partir da regra da carteira.
 *
 * Pura, e separada do texto de propósito: é a única função deste arquivo que
 * produz número, e ela precisa ser testável sozinha. O arredondamento da
 * parcela é para CIMA no centavo — parcela arredondada para baixo somaria menos
 * que a dívida, e a diferença apareceria no fim do acordo como uma cobrança que
 * ninguém combinou.
 */
export function montarOferta(
  saldo: number,
  regra: {
    maxParcelas: number | null;
    valorMinimoParcela: number | null;
    descontoMaximoPercentual: number | null;
  },
  parcelasPedidas?: number | null,
): {
  parcelas: number;
  valorParcela: number;
  descontoPercentual: number;
  valorAVista: number;
} | null {
  if (!(saldo > 0)) return null;

  const teto = regra.maxParcelas ?? 1;
  if (teto < 1) return null;

  const desconto = Math.max(0, Math.min(regra.descontoMaximoPercentual ?? 0, 100));
  const valorAVista = Math.round(saldo * (1 - desconto / 100) * 100) / 100;

  // Quantas parcelas cabem: o pedido da pessoa, limitado pelo teto da carteira
  // e pelo piso da parcela. Sem pedido, oferece o máximo — que é a parcela mais
  // baixa, e é o que costuma destravar a conversa.
  let parcelas = Math.min(parcelasPedidas && parcelasPedidas > 0 ? parcelasPedidas : teto, teto);

  const minimo = regra.valorMinimoParcela ?? 0;
  if (minimo > 0) {
    const cabem = Math.floor(saldo / minimo);
    if (cabem < 1) return null; // nem uma parcela alcança o piso: é caso de gente
    parcelas = Math.max(1, Math.min(parcelas, cabem));
  }

  const valorParcela = Math.ceil((saldo / parcelas) * 100) / 100;

  return {
    parcelas,
    valorParcela,
    descontoPercentual: desconto,
    valorAVista,
  };
}
