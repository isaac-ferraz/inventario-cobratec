// O que o modelo faz agora — e é MUITO menos do que ele fazia.
//
// ────────────────────────── a virada da decisão 32 ──────────────────────────
//
// Antes, o modelo escrevia a resposta. Media-se e ele inventava: "empresa de
// tecnologia", "serviço de pagamento da Receita Federal", um telefone que não
// existe, um valor que ninguém deve. Cada correção era um remendo depois do
// fato — barrar o texto pronto, escalar o assunto perigoso.
//
// Aqui a pergunta muda. Em vez de "como impedir o modelo de inventar?", que não
// tem resposta boa, pergunta-se **"por que ele está escrevendo?"**. Ele não
// precisa. Classificar intenção é o que um modelo pequeno faz bem; redigir fato
// que ele não tem é o que ele faz mal. Então ele só classifica.
//
// A consequência é a garantia mais forte deste sistema: **nenhum número, nome
// ou data que o devedor lê passou pelo modelo.** Não é que ele foi instruído a
// não inventar — é que ele não tem por onde. O texto sai de `chat-respostas.ts`
// preenchido com campo do banco, e a saída do modelo é validada contra uma
// lista fechada. Rótulo que não está na lista vira `outro`, que é gente.
//
// O ganho de conversa vem de graça: como cada resposta é um molde, o robô pode
// sustentar muitos turnos sem que o risco cresça a cada um.

export const INTENCOES = [
  "saudacao",          // "oi", "bom dia"
  "identificar",       // mandou CPF e/ou nascimento
  "consultar_saldo",   // "quanto eu devo?", "qual meu débito?"
  "quer_negociar",     // "dá pra parcelar?", "tem desconto?"
  "aceita",            // "pode ser", "fechado"
  "recusa",            // "não dá", "muito caro"
  "quer_boleto",       // "manda o código", "2ª via"
  "despedida",         // "obrigado", "tchau"
  "ja_pagou",          // → sempre gente
  "contesta",          // "não é minha", "não reconheço" → sempre gente
  "juridico",          // advogado, Procon, processo → sempre gente
  "outro",             // qualquer coisa que não se encaixe → gente
] as const;

export type Intencao = (typeof INTENCOES)[number];

/**
 * Intenções que o robô NUNCA atende, mesmo classificadas com confiança.
 *
 * Repete de propósito o que `assuntoExigeGente` já barra antes do modelo: uma
 * é a trava de entrada (por palavra), esta é a de saída (por rótulo). Quem
 * escreve "recebi uma carta estranha de vocês" não bate em nenhuma palavra da
 * lista de entrada, e ainda assim é assunto de gente — o modelo classifica
 * `outro` e para aqui.
 */
export const SEMPRE_GENTE: Intencao[] = [
  "ja_pagou",
  "contesta",
  "juridico",
  "outro",
];

export function exigeGente(i: Intencao): boolean {
  return SEMPRE_GENTE.includes(i);
}

/**
 * O que o modelo devolve. Note o que NÃO tem aqui: nenhum campo de texto livre
 * que chegue ao devedor.
 *
 * `cpf` e `nascimento` são a única coisa que o modelo extrai, e são dados que a
 * PRÓPRIA pessoa acabou de digitar — o modelo não os inventa, só os recorta da
 * mensagem. Ainda assim eles passam por validação de formato aqui e por
 * conferência no banco depois: se o modelo recortar errado, a consulta não acha
 * ninguém e a conversa vai para gente. Errar aqui não vaza dado de terceiro.
 */
export type Leitura = {
  intencao: Intencao;
  cpf: string | null;
  nascimento: string | null; // AAAA-MM-DD
  /** Quantas parcelas a pessoa pediu, quando disse um número. */
  parcelas: number | null;
};

const SO_DIGITOS = /\D/g;

/**
 * CPF válido pelos dígitos verificadores.
 *
 * Conferir o dígito antes de consultar o banco não é preciosismo: sem isso,
 * cada digitação errada vira uma consulta e um "não encontrei", e a conversa
 * morre num vaivém que parece desconfiança da empresa. Com a conferência, o
 * robô sabe distinguir "digitou errado" de "não é cliente" — e são respostas
 * diferentes.
 */
export function cpfValido(bruto: string): boolean {
  const d = bruto.replace(SO_DIGITOS, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  for (const [ate, pos] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (pos - i);
    const resto = (soma * 10) % 11 % 10;
    if (resto !== Number(d[ate])) return false;
  }
  return true;
}

/**
 * Data de nascimento em vários formatos brasileiros → `AAAA-MM-DD`.
 *
 * Devolve `null` para data que o calendário não tem (31/02) em vez de deixar o
 * `Date` rolar para 03/03 — o mesmo defeito corrigido na decisão 25, e aqui
 * seria pior: uma data rolada consultaria o banco por outra pessoa.
 */
export function normalizarNascimento(bruto: string): string | null {
  const t = (bruto ?? "").trim();
  const br = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const seco = /^(\d{2})(\d{2})(\d{4})$/.exec(t);

  let ano: number, mes: number, dia: number;
  if (br) [dia, mes, ano] = [+br[1], +br[2], +br[3]];
  else if (seco) [dia, mes, ano] = [+seco[1], +seco[2], +seco[3]];
  else if (iso) [ano, mes, dia] = [+iso[1], +iso[2], +iso[3]];
  else return null;

  if (mes < 1 || mes > 12 || dia < 1) return null;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia > ultimo) return null;
  // Gente viva: nascimento fora desta janela é digitação errada, não pessoa.
  const agora = new Date().getUTCFullYear();
  if (ano < 1900 || ano > agora - 15) return null;

  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Acha CPF e nascimento na mensagem sem depender do modelo.
 *
 * Roda ANTES da classificação, e o que ela achar tem precedência sobre o que o
 * modelo disser: uma expressão regular não confunde 11 dígitos, e um modelo de
 * 1B confunde. O modelo só ajuda quando a pessoa escreve por extenso.
 */
export function extrairDados(texto: string): {
  cpf: string | null;
  nascimento: string | null;
} {
  const t = texto ?? "";

  // O padrão é a FORMA do CPF (3-3-3-2, separador opcional), com fronteira de
  // dígito dos dois lados. Um `\d[\d.\s-]{9,17}\d` guloso parece equivalente e
  // não é: em "52998224725 12/04/1985" ele atravessa o espaço, junta o começo
  // da data e devolve 13 dígitos — que não são CPF nenhum, e a pessoa fica
  // ouvindo "me manda seu CPF" depois de já ter mandado.
  let cpf: string | null = null;
  for (const m of t.matchAll(
    /(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}(?!\d)/g,
  )) {
    const d = m[0].replace(SO_DIGITOS, "");
    if (d.length === 11 && cpfValido(d)) {
      cpf = d;
      break;
    }
  }

  let nascimento: string | null = null;
  for (const m of t.matchAll(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}\b/g)) {
    const n = normalizarNascimento(m[0]);
    if (n) {
      nascimento = n;
      break;
    }
  }

  return { cpf, nascimento };
}

/**
 * Valida o que o modelo devolveu. Fora do contrato = `outro` = gente.
 *
 * Não existe caminho por onde uma saída estranha do modelo vire uma resposta ao
 * devedor: ou ela cai num rótulo conhecido, ou vira `outro`. É a mesma escolha
 * de `avaliarResposta` — na dúvida, gente — só que agora a dúvida é sobre uma
 * palavra de uma lista de doze, e não sobre um parágrafo em português.
 */
export function lerSaidaDoModelo(bruta: unknown, mensagem: string): Leitura {
  let dados: Record<string, unknown> = {};
  if (typeof bruta === "string") {
    try {
      dados = JSON.parse(bruta) as Record<string, unknown>;
    } catch {
      dados = {};
    }
  } else if (bruta && typeof bruta === "object") {
    dados = bruta as Record<string, unknown>;
  }

  const rotulo = String(dados.intencao ?? "").trim().toLowerCase();
  const intencao: Intencao = (INTENCOES as readonly string[]).includes(rotulo)
    ? (rotulo as Intencao)
    : "outro";

  // O que a regex achou vence o que o modelo disse.
  const achado = extrairDados(mensagem);
  const cpfModelo =
    typeof dados.cpf === "string" && cpfValido(dados.cpf)
      ? dados.cpf.replace(SO_DIGITOS, "")
      : null;
  const nascModelo =
    typeof dados.nascimento === "string"
      ? normalizarNascimento(dados.nascimento)
      : null;

  const parcelas =
    typeof dados.parcelas === "number" &&
    Number.isInteger(dados.parcelas) &&
    dados.parcelas > 0 &&
    dados.parcelas <= 120
      ? dados.parcelas
      : null;

  return {
    intencao,
    cpf: achado.cpf ?? cpfModelo,
    nascimento: achado.nascimento ?? nascModelo,
    parcelas,
  };
}

/**
 * O prompt do classificador.
 *
 * Não precisa ensinar tom, educação nem o que a empresa faz — nada disso é
 * trabalho dele. Some com o tom, some a chance de o tom sair errado.
 *
 * **Os exemplos estão aqui porque foram medidos.** Sem eles, o 3B acertava
 * 20/26 e tinha um ímã: qualquer frase que ele não entendia virava `despedida`
 * — inclusive "já paguei isso" e "manda o boleto", que são casos de gente. Com
 * os exemplos, 26/26 e nenhum erro para o lado perigoso.
 *
 * E uma instrução a mais PIOROU: acrescentar "olhe o que a pessoa quer, não a
 * educação da frase" derrubou para 25/26. Exemplo ensina; explicação atrapalha.
 * Se for mexer aqui, meça antes — o script da medição está em decisões (32).
 */
export const PROMPT_CLASSIFICADOR = `Você classifica a intenção de mensagens recebidas no WhatsApp de uma empresa de cobrança.

Responda SÓ com JSON: {"intencao":"<rótulo>","parcelas":<número ou null>}

Use EXATAMENTE um destes rótulos:
saudacao - cumprimento, "oi", "bom dia"
identificar - mandou CPF, data de nascimento ou nome para se identificar
consultar_saldo - quer saber quanto deve, qual o valor, qual a dívida
quer_negociar - quer parcelar, desconto, acordo, "como faço para pagar"
aceita - concorda com o que foi oferecido
recusa - não concorda, acha caro, não pode pagar
quer_boleto - pede boleto, código de barras, pix, segunda via
despedida - agradece ou se despede, "obrigado", "tchau"
ja_pagou - afirma que já pagou
contesta - diz que a dívida não é dele, não reconhece, fala em golpe
juridico - cita advogado, Procon, processo, justiça
outro - qualquer outra coisa

Na dúvida entre dois rótulos, responda "outro".

Exemplos:
"bom dia" -> {"intencao":"saudacao","parcelas":null}
"quanto eu devo" -> {"intencao":"consultar_saldo","parcelas":null}
"da pra parcelar em 6x" -> {"intencao":"quer_negociar","parcelas":6}
"pode ser" -> {"intencao":"aceita","parcelas":null}
"ta caro demais" -> {"intencao":"recusa","parcelas":null}
"manda o boleto" -> {"intencao":"quer_boleto","parcelas":null}
"ja paguei isso" -> {"intencao":"ja_pagou","parcelas":null}
"essa divida nao e minha" -> {"intencao":"contesta","parcelas":null}
"vou chamar meu advogado" -> {"intencao":"juridico","parcelas":null}
"obrigado, tchau" -> {"intencao":"despedida","parcelas":null}
"quanto custa uma pizza" -> {"intencao":"outro","parcelas":null}

"parcelas" só quando a pessoa disser um número de vezes. Senão null.`;
