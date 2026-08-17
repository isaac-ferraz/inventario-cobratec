// Quem é o devedor: documento + nome do titular.
//
// ─────────────────────── por que deixou de ser nascimento ───────────────────
//
// A dupla verificação continua sendo dupla — o que mudou é o segundo fator. Era
// a data de nascimento, e ela tem um defeito que só apareceu ao olhar o banco:
// as 2.532 empresas do cadastro têm `devdatnas = 0001-01-01`, a sentinela de
// "não tem data". Empresa não nasce. Com nascimento como segundo fator, nenhuma
// delas conseguia se identificar — o robô pedia um dado que não existia e a
// conversa ia para a fila, sempre.
//
// Trocando por nome do titular, pessoa física e jurídica passam pela mesma
// porta: CPF + nome, CNPJ + razão social.
//
// **O preço, dito em voz alta:** razão social é informação PÚBLICA (consulta na
// Receita). Para empresa, o segundo fator é mais fraco do que era — quem tiver
// um CNPJ descobre a razão social sem esforço. A escolha foi feita sabendo
// disso, porque empresa travada é empresa que não negocia. Se um dia isso doer,
// o conserto é exigir um terceiro dado não público (valor da última fatura,
// por exemplo), e não voltar ao nascimento — que empresa nenhuma tem.

/** Particulas que não contam como "pedaço do nome". */
const PARTICULAS = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "E", "DEL", "LA", "LE",
  // Sufixos de razão social: aparecem em milhares de cadastros e por isso não
  // provam nada. "LTDA" + "ME" bateria em qualquer empresa do banco.
  "LTDA", "ME", "MEI", "EPP", "EIRELI", "SA", "S", "A", "CIA", "COMERCIO",
  "SERVICOS", "INDUSTRIA", "COM", "IND",
]);

/**
 * Nome comparável: sem acento, maiúsculo, sem pontuação e sem o código de
 * cadastro que o Siscobra gruda na frente (ver decisão 32.3 — "735705Violene").
 */
export function normalizarNome(bruto: string | null | undefined): string {
  if (!bruto) return "";
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acento separadas pelo NFD
    .toUpperCase()
    .replace(/^\d{2,}\s*/, "") // código colado ou separado, mesma regra da 32.3
    .replace(/[^A-Z0-9\s]/g, " ") // pontuação vira espaço: "S.S.REPRESENTACOES"
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Os pedaços que provam alguma coisa.
 *
 * Fora as partículas, exige 2 letras — "DE SOUSA" não pode valer como acerto,
 * senão qualquer frase com preposição passaria por metade dos cadastros.
 */
export function pedacosDoNome(bruto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const p of normalizarNome(bruto).split(" ")) {
    // Corrida de dígitos é código de cadastro perdido no meio, não nome.
    if (p.length < 2 || PARTICULAS.has(p) || /^\d+$/.test(p)) continue;
    vistos.add(p);
  }
  return [...vistos];
}

/**
 * O nome digitado confere com o do cadastro?
 *
 * A regra é **dois pedaços quaisquer**: ordem trocada passa, nome do meio
 * omitido passa, e "Gabrieli" sozinho não passa. Foi escolha do TI, entre uma
 * conferência exata (que recusaria quem digita "Gabrieli Sousa" em vez do nome
 * inteiro) e esta, que troca um pouco de rigor por uma identificação que
 * acontece de verdade.
 *
 * Dois, e não um, porque um pedaço só é fraco demais: "SILVA" bate com dezenas
 * de milhares de cadastros, e o primeiro nome sozinho é o que qualquer parente
 * sabe. Dois pedaços já exigem conhecer o nome da pessoa, não um fragmento.
 *
 * Cadastro com uma palavra só (existe: "Violene") nunca chegaria a dois. Nesse
 * caso o exigido é que o único pedaço bata — e não que o impossível aconteça.
 */
export function nomeConfere(
  digitado: string | null | undefined,
  cadastro: string | null | undefined,
): boolean {
  const doCadastro = new Set(pedacosDoNome(cadastro));
  if (doCadastro.size === 0) return false;

  const acertos = pedacosDoNome(digitado).filter((p) => doCadastro.has(p)).length;
  return acertos >= Math.min(2, doCadastro.size);
}

// ─────────────────────────── documento ───────────────────────────

const SO_DIGITOS = /\D/g;

function digitosVerificadores(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((t, d, i) => t + Number(d) * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CPF com dígitos verificadores conferidos. */
export function cpfValido(bruto: string): boolean {
  const d = (bruto ?? "").replace(SO_DIGITOS, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  return (
    digitosVerificadores(d.slice(0, 9), p1) === Number(d[9]) &&
    digitosVerificadores(d.slice(0, 10), p2) === Number(d[10])
  );
}

/** CNPJ com dígitos verificadores conferidos. */
export function cnpjValido(bruto: string): boolean {
  const d = (bruto ?? "").replace(SO_DIGITOS, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return (
    digitosVerificadores(d.slice(0, 12), p1) === Number(d[12]) &&
    digitosVerificadores(d.slice(0, 13), p2) === Number(d[13])
  );
}

export type TipoDocumento = "cpf" | "cnpj";

/**
 * Documento normalizado, ou `null`.
 *
 * Confere o dígito verificador de propósito: sem isso, um número digitado errado
 * viraria consulta ao banco por OUTRA pessoa — e o robô responderia "não
 * localizei" quando o certo é "você errou um número".
 */
export function normalizarDocumento(
  bruto: string | null | undefined,
): { digitos: string; tipo: TipoDocumento } | null {
  const d = (bruto ?? "").replace(SO_DIGITOS, "");
  if (d.length === 11 && cpfValido(d)) return { digitos: d, tipo: "cpf" };
  if (d.length === 14 && cnpjValido(d)) return { digitos: d, tipo: "cnpj" };
  return null;
}

/**
 * Acha o documento na mensagem: 11 dígitos (CPF) ou 14 (CNPJ).
 *
 * A forma é casada com separador opcional, e a fronteira `(?<!\d)`/`(?!\d)`
 * existe para o padrão não morder metade de um número maior — o mesmo cuidado
 * que a versão anterior tinha com CPF colado numa data.
 */
export function extrairDocumento(
  texto: string,
): { digitos: string; tipo: TipoDocumento } | null {
  const t = texto ?? "";
  // CNPJ primeiro: 14 dígitos contêm 11: procurar CPF antes acharia um
  // "CPF" dentro do CNPJ e mandaria o robô consultar um documento que não foi
  // digitado. O mais longo ganha.
  const formas = [
    /(?<!\d)\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[/\s-]?\d{4}[.\s-]?\d{2}(?!\d)/g,
    /(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}(?!\d)/g,
  ];
  for (const forma of formas) {
    for (const m of t.matchAll(forma)) {
      const doc = normalizarDocumento(m[0]);
      if (doc) return doc;
    }
  }
  // Última tentativa: dígitos soltos, sem forma nenhuma ("meu cpf 52998224725").
  const cru = t.replace(SO_DIGITOS, "");
  return normalizarDocumento(cru);
}

/**
 * Acha o nome do titular na mensagem.
 *
 * Não tenta entender a frase: tira os números e as palavras de recado ("meu
 * nome é", "sou o") e entrega o resto. Quem julga é `nomeConfere`, contra o
 * cadastro — palavra sobrando não faz mal, porque ela simplesmente não bate.
 *
 * Devolve `null` com menos de dois pedaços úteis, e aí o robô pede o nome
 * completo em vez de consultar com meio nome e responder "não localizei".
 */
const RECADO = new Set([
  "MEU", "MINHA", "NOME", "SOU", "EU", "AQUI", "FALA", "CHAMO", "ME",
  "TITULAR", "RAZAO", "SOCIAL", "EMPRESA", "CPF", "CNPJ", "DOCUMENTO",
  "BOM", "DIA", "BOA", "TARDE", "NOITE", "OLA", "OI", "SIM", "NAO",
  "OBRIGADO", "OBRIGADA", "POR", "FAVOR", "SEGUE", "SEGUEM", "AI",
]);

export function extrairNome(texto: string): string | null {
  const limpo = normalizarNome((texto ?? "").replace(/\d+/g, " "));
  const uteis = limpo
    .split(" ")
    .filter((p) => p.length >= 2 && !RECADO.has(p) && !PARTICULAS.has(p));
  return uteis.length >= 2 ? uteis.join(" ") : null;
}
