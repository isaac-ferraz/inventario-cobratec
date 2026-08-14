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

/**
 * "PEDRO" → "Pedro". O Siscobra guarda o nome em caixa alta, e o robô saía
 * gritando com o devedor: "Olá, PEDRO!".
 *
 * Capitaliza só o que é letra, e por isso "7M" continua "7M" — razão social que
 * começa com dígito existe no cadastro (decisão 32.3), e um `toLowerCase` seco a
 * transformaria em "7m". Nome já bem escrito ("Gabrieli") passa igual.
 */
export function nomeProprio(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_, antes, letra) => antes + letra.toLocaleUpperCase("pt-BR"));
}

/**
 * A abertura da mensagem.
 *
 * Com nome, chama pela pessoa: "Pedro, localizei seu cadastro." Sem nome, abre
 * com "Olá!". O `frase` chega em MINÚSCULA e a maiúscula é decidida aqui — foi o
 * detalhe que quase passou: emendar "Pedro, " num texto que começava em
 * maiúscula produzia "Pedro, Localizei…", que é erro de português na cara do
 * devedor.
 */
function abrir(nome: string | null, frase: string): string {
  // Só a primeira palavra. Depois da identificação o nome já vem assim (é o
  // `primeiroNome` do Siscobra), mas ANTES dela quem manda é o pushName do
  // WhatsApp — texto livre que a pessoa escreve no próprio aparelho, e que
  // aparece como "Isaac Ferraz - Cobratec". Emendar isso numa frase daria
  // "Isaac Ferraz - Cobratec, aqui é a Cobratec…".
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (primeiro) return `${nomeProprio(primeiro)}, ${frase}`;
  return `Olá! ${frase.charAt(0).toLocaleUpperCase("pt-BR")}${frase.slice(1)}`;
}

export const RESPOSTAS = {
  // ── entrada ──────────────────────────────────────────────────────────────
  /**
   * A primeira fala. Ela **termina em pergunta** de propósito.
   *
   * A versão anterior — "aqui é a Cobratec. Posso ajudar com sua negociação por
   * aqui mesmo." — era um aviso, não um convite: dizia o que a empresa faz e
   * deixava a pessoa sem nada para responder. Numa conversa de cobrança, silêncio
   * depois da primeira mensagem é a conversa morrendo.
   *
   * O que ela NÃO diz: que existe dívida. Antes de conferir documento e nome não
   * se sabe com quem se fala, e afirmar pendência a quem herdou a linha é contar
   * a um estranho que o antigo dono devia — o mesmo vazamento que fez a consulta
   * por telefone ficar de fora (lib/siscobra.ts).
   */
  saudacao: (nome: string | null) =>
    abrir(
      nome,
      "tudo bem? Aqui é a Cobratec. Posso verificar se há algo em aberto no seu " +
        "nome e resolver com você por aqui mesmo, sem precisar de ligação. " +
        "Quer que eu dê uma olhada?",
    ),

  /**
   * O segundo cumprimento seguido.
   *
   * Existe porque no primeiro atendimento real a pessoa disse "olá" e depois
   * "boa tarde", e recebeu a MESMA frase duas vezes, palavra por palavra. Eco é
   * o jeito mais rápido de alguém perceber que fala com máquina e desistir.
   *
   * Mais curta que a primeira, e ainda apontando o caminho: quem cumprimenta de
   * novo geralmente não sabe o que pode pedir.
   */
  saudacaoDeNovo: (nome: string | null) =>
    abrir(
      nome,
      "estou por aqui. É só me dizer o que você precisa — posso consultar o que " +
        "está em aberto ou falar sobre um acordo.",
    ),

  /**
   * O pedido de identificação diz POR QUE pede.
   *
   * Devedor desconfia de quem pede CPF no WhatsApp, e com razão — é o formato
   * clássico do golpe. Dizer que é para proteger o dado dele, e não para
   * liberar o nosso sistema, é a diferença entre cooperar e bloquear o número.
   */
  pedirIdentificacao: () =>
    "Para eu falar de valores preciso ter certeza de que é você mesmo — é a " +
    "regra que protege seus dados. Pode me enviar seu CPF ou CNPJ e o nome " +
    "completo do titular?",

  // "Nome completo" está escrito porque a conferência precisa de dois pedaços:
  // quem responde só o primeiro nome seria recusado sem entender por quê.
  faltaNome: () =>
    "Recebi o documento. Agora me diga o nome completo do titular, por favor.",
  faltaDocumento: () => "Recebi o nome. Agora me envie seu CPF ou CNPJ, por favor.",

  documentoInvalido: () =>
    "Esse documento não parece completo. Pode conferir e mandar os 11 números " +
    "do CPF, ou os 14 do CNPJ?",

  naoEncontrado: () =>
    "Não localizei um cadastro com esses dados. Vou chamar uma atendente para " +
    "verificar com você.",

  // ── valores (só depois de identificado) ───────────────────────────────────
  saldo: (d: { nome: string | null; saldo: number; vencidoDesde: string | null }) => {
    const base = abrir(
      d.nome,
      `localizei seu cadastro. O valor em aberto é ${reais(d.saldo)}`,
    );
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
   * Consulta ao Siscobra falhou — rede, banco fora do ar, VPN caída.
   *
   * Este é o pior momento possível para o robô emudecer: a pessoa acabou de
   * mandar documento e nome do titular, e receber nada em troca parece descaso ou
   * golpe. Diz que o problema é nosso, não dela, e que alguém vai assumir.
   */
  sistemaIndisponivel: () =>
    "Estou com uma dificuldade para consultar seu cadastro agora. Já vou " +
    "chamar uma atendente para continuar com você — seus dados estão seguros.",

  /** "Pode ser" sem nada na mesa: concordou com o quê? */
  confirmarComGente: () =>
    "Perfeito. Vou chamar uma atendente para acertar os detalhes com você.",

  /**
   * O que o robô não sabe tratar. Genérico de propósito: qualquer tentativa de
   * ser específico aqui viraria chute sobre o que a pessoa quis dizer.
   */
  naoSeiTratar: () =>
    "Entendi. Vou chamar uma atendente para te ajudar com isso.",

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
