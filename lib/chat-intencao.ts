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

import {
  extrairDocumento,
  extrairNome,
  normalizarDocumento,
} from "@/lib/identificacao";

export const INTENCOES = [
  "saudacao",          // "oi", "bom dia"
  "identificar",       // mandou documento e/ou nome do titular
  "consultar_saldo",   // "quanto eu devo?", "qual meu débito?"
  "quer_negociar",     // "dá pra parcelar?", "tem desconto?"
  "aceita",            // "pode ser", "fechado"
  "recusa",            // "não dá", "muito caro"
  "quer_boleto",       // "manda o código", "2ª via"
  "sobre_empresa",     // "o que vocês fazem?", "que empresa é essa?"
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
 * `documento` e `nome` são a única coisa que o modelo extrai, e são dados que a
 * PRÓPRIA pessoa acabou de digitar — o modelo não os inventa, só os recorta da
 * mensagem. Ainda assim eles passam por validação de formato aqui e por
 * conferência no banco depois: se o modelo recortar errado, a consulta não acha
 * ninguém e a conversa vai para gente. Errar aqui não vaza dado de terceiro.
 */
export type Leitura = {
  intencao: Intencao;
  /** Só dígitos: 11 (CPF) ou 14 (CNPJ). */
  documento: string | null;
  /** Nome do titular como a pessoa digitou; quem confere é `nomeConfere`. */
  nome: string | null;
  /** Quantas parcelas a pessoa pediu, quando disse um número. */
  parcelas: number | null;
  /**
   * O modelo respondeu?
   *
   * `false` quando ele está fora do ar, estourou o tempo ou devolveu formato
   * quebrado. A conversa vai para gente nos dois casos — o que muda é o MOTIVO
   * que a operadora lê na fila. Sem isto, robô caído aparecia como "assunto fora
   * do que o robô atende", e a fila enchia de um diagnóstico errado enquanto
   * ninguém percebia que o modelo tinha morrido.
   *
   * Obrigatório, e não opcional, pelo mesmo motivo de `aviso` em `Acao`: o
   * compilador cobra de quem construir uma `Leitura` nova.
   */
  respondeu: boolean;
};

// `cpfValido`, `normalizarNascimento` e o recorte de CPF saíram daqui na decisão
// 34: a identificação deixou de ser CPF + nascimento e virou documento + nome,
// e as duas regras novas (CPF **ou** CNPJ, e a conferência do nome) moram em
// `lib/identificacao.ts`. Manter cópias aqui era o convite para elas divergirem
// — foi assim que a lista de papéis divergiu uma vez (decisão 25.1).

/**
 * Acha documento e nome na mensagem sem depender do modelo.
 *
 * Roda ANTES da classificação, e o que ela achar tem precedência sobre o que o
 * modelo disser: uma expressão regular não confunde 11 dígitos, e um modelo de
 * 1B confunde. O modelo só ajuda quando a pessoa escreve por extenso.
 */
export function extrairDados(texto: string): {
  documento: string | null;
  nome: string | null;
} {
  const doc = extrairDocumento(texto ?? "");
  return { documento: doc?.digitos ?? null, nome: extrairNome(texto ?? "") };
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
  const docModelo =
    typeof dados.documento === "string"
      ? (normalizarDocumento(dados.documento)?.digitos ?? null)
      : null;
  const nomeModelo =
    typeof dados.nome === "string" ? extrairNome(dados.nome) : null;

  const parcelas =
    typeof dados.parcelas === "number" &&
    Number.isInteger(dados.parcelas) &&
    dados.parcelas > 0 &&
    dados.parcelas <= 120
      ? dados.parcelas
      : null;

  return {
    intencao,
    documento: achado.documento ?? docModelo,
    nome: achado.nome ?? nomeModelo,
    // Chegou até aqui: o modelo respondeu, mesmo que com rótulo desconhecido —
    // que vira `outro` acima, e `outro` é gente por decisão, não por falha.
    respondeu: true,
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
identificar - mandou CPF, CNPJ ou nome para se identificar
consultar_saldo - quer saber quanto deve, qual o valor, qual a dívida
quer_negociar - quer parcelar, desconto, acordo, "como faço para pagar"
aceita - concorda com o que foi oferecido
recusa - não concorda, acha caro, não pode pagar
quer_boleto - pede boleto, código de barras, pix, segunda via
sobre_empresa - pergunta quem é a empresa ou o que ela faz
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
"o que voces fazem" -> {"intencao":"sobre_empresa","parcelas":null}
"obrigado, tchau" -> {"intencao":"despedida","parcelas":null}
"quanto custa uma pizza" -> {"intencao":"outro","parcelas":null}

"parcelas" só quando a pessoa disser um número de vezes. Senão null.`;
