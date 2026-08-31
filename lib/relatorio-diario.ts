// As regras puras do relatório diário — a linha de comando e o diagnóstico.
//
// ───────────────────────── por que não ficam no script ─────────────────────────
//
// O `vitest.config.ts` só varre `lib/**` e `tests/api/**`. Uma regra escrita
// dentro de `scripts/` é, por construção, uma regra sem teste — e as daqui não
// são formalidades: o padrão do `--dia` é "ontem", e ninguém confere isso à mão
// de manhã; um código de carteira meio lido apontaria para a carteira errada em
// silêncio. É o mesmo caminho que `lib/chamados.ts` e `lib/ativos.ts` já fazem —
// a decisão mora numa função pura, o arredor faz I/O.
import { somarDias } from "@/lib/relatorios";
import { dataDoCalendario } from "@/lib/validations";
import type { Publico } from "@/lib/excel-relatorios";

/** Carteira padrão: Rede Drogal. */
export const CARTEIRA_PADRAO = 1163;

/** Quantos dias para frente a agenda de vencimento cobre. */
export const JANELA_PADRAO = 15;

/** Teto da janela, igual ao `MAX_DIAS` do período: o CRM é produção. */
export const JANELA_MAX = 92;

export type ArgumentosDiario = {
  carteiras: number[];
  dia: string;
  janelaDias: number;
  saida: string;
  publico: Publico;
  /** Gerar a planilha e NÃO mandar e-mail (`--sem-email`). */
  semEmail: boolean;
};

/**
 * Flags que não levam valor.
 *
 * Existe porque o laço abaixo consome o próximo argv como valor da chave. Sem
 * esta lista, `--sem-email --carteira 77` guardaria `sem-email = "--carteira"`
 * e **pularia a carteira**, gerando em silêncio o relatório da 1163 quando
 * alguém pediu a 77.
 */
const SEM_VALOR = new Set(["sem-email"]);

/**
 * Lê `--chave valor` e `--chave=valor` de um argv já sem o `node script`.
 *
 * Recebe `hoje` em vez de chamar `hojeNoBrasil()` por dentro: função que lê o
 * relógio não se testa sem congelar o tempo, e o dia é justamente a regra que
 * mais interessa afirmar aqui.
 */
export function lerArgumentos(argv: string[], hoje: string): ArgumentosDiario {
  const mapa = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [chave, colado] = a.slice(2).split("=");
    if (SEM_VALOR.has(chave) && colado === undefined) {
      mapa.set(chave, "1");
      continue;
    }
    mapa.set(chave, colado ?? argv[++i] ?? "");
  }

  const carteiraTexto = mapa.get("carteira") ?? String(CARTEIRA_PADRAO);
  const carteiras = carteiraTexto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // `Number("12abc")` é NaN, mas `parseInt` devolveria 12 — e um código
      // meio lido apontaria para a carteira errada em silêncio.
      const n = Number(s);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Código de carteira inválido: “${s}”.`);
      }
      return n;
    });
  if (carteiras.length === 0) throw new Error("Informe ao menos uma carteira.");

  // O padrão é o dia ANTERIOR, no fuso do Brasil. Chamado às 8h de 27/08, o
  // relatório é o de 26/08 — que é o pedido. O `--dia` existe para regenerar
  // uma sexta-feira que ficou para trás.
  const dia = mapa.get("dia") ?? somarDias(hoje, -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new Error(`--dia deve estar no formato AAAA-MM-DD (veio “${dia}”).`);
  }
  if (!dataDoCalendario(dia)) {
    throw new Error(`--dia não existe no calendário: ${dia}.`);
  }
  if (dia > hoje) {
    throw new Error(`--dia está no futuro: ${dia} (hoje é ${hoje}).`);
  }

  const janelaDias = Number(mapa.get("janela") ?? JANELA_PADRAO);
  if (!Number.isInteger(janelaDias) || janelaDias < 1 || janelaDias > JANELA_MAX) {
    throw new Error(`--janela deve ser um inteiro de 1 a ${JANELA_MAX} dias.`);
  }

  const publico = (mapa.get("publico") ?? "cliente") as Publico;
  if (publico !== "cliente" && publico !== "interno") {
    throw new Error('--publico só aceita "cliente" ou "interno".');
  }

  // O padrão do público é "cliente", e não "interno" como no resto do sistema:
  // este comando existe para produzir o anexo que sai da empresa. Errar para o
  // lado do arquivo COM nome de operadora seria errar para o lado que não dá
  // para desfazer depois de o e-mail ter sido encaminhado.
  return {
    carteiras,
    dia,
    janelaDias,
    saida: mapa.get("saida") ?? "data/relatorios",
    publico,
    // O padrão é MANDAR. `--sem-email` é para regerar um arquivo sem encher a
    // caixa de entrada de novo — o inverso (ter de lembrar de pedir o envio
    // todo dia) derrotaria o comando inteiro.
    semEmail: mapa.has("sem-email"),
  };
}

/** "REDE DROGAL" → "rede-drogal". O arquivo vai viver numa pasta com outros. */
export function apelidoDeArquivo(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // marca de acento, escrita por código
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      .replace(/-$/, "") || "carteira"
  );
}

/** `rede-drogal-2026-08-26.xlsx`, com `-interno` quando for a versão de casa. */
export function nomeDoArquivo(
  carteira: string,
  dia: string,
  publico: Publico,
): string {
  return `${apelidoDeArquivo(carteira)}-${dia}${
    publico === "interno" ? "-interno" : ""
  }.xlsx`;
}

// ─────────────────────────── traduzir o erro do pg ───────────────────────────
//
// O que o `pg` devolve quando o CRM não responde é "Connection terminated due to
// connection timeout" — verdadeiro e inútil. Quem lê isso não sabe se está fora
// da rede, se digitou a senha errada ou se derrubou o banco.
//
// A distinção que importa é UMA: dá para chegar no servidor, ou não? Mandar
// alguém "entrar na VPN" quando o problema é senha recusada é pior do que não
// dizer nada — a pessoa vai passar meia hora no lugar errado. Por isso rede e
// credencial saem com frases diferentes, e o que não se reconhece sai como veio,
// sem palpite.

/** Códigos de rede do Node e o `57014`/`28P01`/`3D000` do próprio Postgres. */
const REDE = [
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ECONNRESET",
  "EPIPE",
];

function codigoDe(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === "string" ? c : "";
}

function mensagemDe(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" ? m : String(e);
}

/**
 * A mensagem que vai para o `erro` do JSON — e daí para os olhos de uma pessoa.
 *
 * `onde` é o servidor por extenso ("192.168.0.253:5432"), porque a primeira
 * coisa que se faz com essa frase é tentar um ping.
 */
export function explicarErro(e: unknown, onde: string): string {
  const codigo = codigoDe(e);
  const msg = mensagemDe(e);

  if (
    REDE.includes(codigo) ||
    /connection timeout|timeout expired|terminated unexpectedly/i.test(msg)
  ) {
    return (
      `O Siscobra (${onde}) não respondeu: ${msg}. ` +
      "Ele só atende dentro da rede da Cobratec — rode esta máquina no " +
      "escritório ou pela VPN. Nenhum relatório foi gerado."
    );
  }
  if (codigo === "28P01" || /password authentication failed/i.test(msg)) {
    // Chegou no servidor. Mandar essa pessoa para a VPN seria mandá-la para o
    // lugar errado.
    return (
      `O Siscobra (${onde}) respondeu, mas recusou o usuário: ${msg}. ` +
      "Isto NÃO é problema de rede — confira DB_USER e DB_PASSWORD no .env."
    );
  }
  if (codigo === "3D000" || /database .* does not exist/i.test(msg)) {
    return (
      `O Siscobra (${onde}) respondeu, mas não tem o banco pedido: ${msg}. ` +
      "Confira DB_NAME no .env."
    );
  }
  if (codigo === "57014" || /canceling statement due to statement timeout/i.test(msg)) {
    return (
      "Uma das consultas passou do tempo no Siscobra e foi cancelada pelo " +
      "próprio banco. O CRM é de produção e pode estar sob carga; tente de novo " +
      "mais tarde, ou reduza o recorte (menos carteiras, --janela menor)."
    );
  }
  return msg;
}

/**
 * "192.168.0.253:5432" a partir do `.env`, para a frase acima.
 *
 * O parâmetro é um mapa qualquer, e não `NodeJS.ProcessEnv`: o teste passa duas
 * chaves, e o tipo do Node exige `NODE_ENV` — obrigar o teste a montar um
 * ambiente inteiro para conferir dois campos é a cauda balançando o cachorro.
 */
export function ondeFicaOSiscobra(
  env: Record<string, string | undefined> = process.env,
): string {
  return `${env.DB_HOST ?? "?"}:${env.DB_PORT ?? 5432}`;
}
