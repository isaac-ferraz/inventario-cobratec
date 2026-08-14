// O RECORTE de um relatório: qual período, em que fuso, com que teto.
//
// Está separado das consultas de propósito. Aqui não há banco, rede nem SQL —
// só a aritmética de datas, que é justamente a parte que erra em silêncio e por
// isso precisa de teste (`lib/relatorios.test.ts`).
//
// ─────────────────────── por que o fuso é explícito ───────────────────────
//
// "Quantos acordos tiveram HOJE?" é a primeira pergunta do relatório, e "hoje"
// não é uma constante: o app roda em Docker, que sobe em **UTC** salvo ordem
// em contrário. Às 21h de São Paulo já é o dia seguinte em UTC — o painel
// mostraria o dia errado (zerado) justamente no fim do expediente, que é
// quando o gestor olha. E o Siscobra grava `timestamp without time zone` com
// hora de parede do Brasil (o servidor dele está em America/Sao_Paulo), então
// a data precisa ser calculada no MESMO fuso em que ela foi gravada.
//
// A conversão acontece uma vez, aqui, e o resto do sistema só troca strings
// "AAAA-MM-DD" — que é o formato que o Postgres compara com `::date` sem
// interpretar fuso nenhum.
import { dataDoCalendario } from "@/lib/validations";

export const FUSO_BRASIL = "America/Sao_Paulo";

/**
 * Teto do intervalo, em dias.
 *
 * Não é gosto por números redondos: a consulta de acionamentos varre a tabela
 * `retorno`, que tem **55 milhões de linhas**, e o CRM é o banco de produção
 * onde a operação está trabalhando agora. Um trimestre foi medido em menos de
 * um segundo; um ano abriria a porta para alguém deixar o painel aberto
 * segurando conexão do sistema de quem está atendendo.
 */
export const MAX_DIAS = 92;

export type ChavePeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "personalizado";

export const PERIODOS: { chave: ChavePeriodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "7d", rotulo: "Últimos 7 dias" },
  { chave: "30d", rotulo: "Últimos 30 dias" },
  { chave: "mes", rotulo: "Mês atual" },
  { chave: "personalizado", rotulo: "Escolher datas" },
];

const CHAVES = new Set<string>(PERIODOS.map((p) => p.chave));

export function ehChavePeriodo(v: string): v is ChavePeriodo {
  return CHAVES.has(v);
}

/** O dia de hoje como o Brasil o vê — "AAAA-MM-DD". */
export function hojeNoBrasil(agora: Date = new Date()): string {
  // "en-CA" formata como AAAA-MM-DD; é o atalho estável para ISO com fuso.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Soma (ou subtrai) dias de uma data ISO, sem passar perto de fuso local. */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias, 12, 0, 0, 0));
  return d.toISOString().slice(0, 10);
}

/** Quantos dias o intervalo cobre, contando as duas pontas (13→13 = 1). */
export function diasNoIntervalo(inicio: string, fim: string): number {
  const ms =
    Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export type Periodo = { inicio: string; fim: string };
export type ResultadoPeriodo =
  | ({ ok: true } & Periodo)
  | { ok: false; erro: string };

/**
 * Traduz a escolha da tela em duas datas concretas.
 *
 * `hoje` entra como parâmetro em vez de ser lido do relógio aqui dentro: é o
 * que deixa a função testável sem congelar o tempo do processo inteiro.
 */
export function resolverPeriodo(
  entrada: { periodo?: string | null; inicio?: string | null; fim?: string | null },
  hoje: string,
): ResultadoPeriodo {
  const chave = entrada.periodo ?? "hoje";
  if (!ehChavePeriodo(chave)) {
    return { ok: false, erro: `Período desconhecido: ${chave}.` };
  }

  if (chave !== "personalizado") {
    const pronto: Record<Exclude<ChavePeriodo, "personalizado">, Periodo> = {
      hoje: { inicio: hoje, fim: hoje },
      ontem: { inicio: somarDias(hoje, -1), fim: somarDias(hoje, -1) },
      // Inclui hoje: "últimos 7 dias" com o dia corrente de fora é a leitura
      // que ninguém espera de um painel aberto durante o expediente.
      "7d": { inicio: somarDias(hoje, -6), fim: hoje },
      "30d": { inicio: somarDias(hoje, -29), fim: hoje },
      mes: { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje },
    };
    return { ok: true, ...pronto[chave] };
  }

  const { inicio, fim } = entrada;
  if (!inicio || !fim) {
    return { ok: false, erro: "Informe a data inicial e a data final." };
  }
  for (const [rotulo, valor] of [
    ["inicial", inicio],
    ["final", fim],
  ] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return { ok: false, erro: `Data ${rotulo} deve estar no formato AAAA-MM-DD.` };
    }
    // Mesma regra de calendário do resto do sistema (decisão 25): "2026-02-31"
    // passa na regex e o JS o empurra calado para 03/03.
    if (!dataDoCalendario(valor)) {
      return {
        ok: false,
        erro: `Data ${rotulo} não existe no calendário: ${valor}.`,
      };
    }
  }
  if (inicio > fim) {
    return { ok: false, erro: "A data inicial não pode ser depois da final." };
  }
  const dias = diasNoIntervalo(inicio, fim);
  if (dias > MAX_DIAS) {
    return {
      ok: false,
      erro: `O intervalo é de ${dias} dias; o máximo é ${MAX_DIAS} (o CRM é o banco de produção).`,
    };
  }
  return { ok: true, inicio, fim };
}

// ─────────────────────────── a janela que olha para frente ───────────────────
//
// O relatório de acordos pergunta "o que fechou" e por isso só olha para trás —
// `resolverPeriodo` acima nem aceita data futura. A carteira pergunta o oposto:
// "o que vence", e a resposta útil está nos próximos dias.
//
// São duas funções e não um parâmetro `futuro: boolean` porque os limites são
// diferentes de verdade: lá o teto existe para proteger o CRM de uma varredura
// de um ano em `retorno` (55M linhas); aqui ele existe para a agenda caber na
// tela — trinta colunas de dia já são o limite do que alguém lê de uma vez.

export type ChaveJanela = "prox7" | "prox15" | "prox30" | "prox60" | "personalizado";

export const JANELAS: { chave: ChaveJanela; rotulo: string }[] = [
  { chave: "prox7", rotulo: "Próximos 7 dias" },
  { chave: "prox15", rotulo: "Próximos 15 dias" },
  { chave: "prox30", rotulo: "Próximos 30 dias" },
  { chave: "prox60", rotulo: "Próximos 60 dias" },
  { chave: "personalizado", rotulo: "Escolher datas" },
];

const CHAVES_JANELA = new Set<string>(JANELAS.map((j) => j.chave));

export function ehChaveJanela(v: string): v is ChaveJanela {
  return CHAVES_JANELA.has(v);
}

/**
 * A janela de vencimento — de hoje para frente.
 *
 * Inclui HOJE na ponta de baixo: parcela que vence hoje ainda é cobrável hoje,
 * e deixá-la de fora esvaziaria o painel justamente no dia em que ele mais
 * serve. O teto de `MAX_DIAS` continua valendo porque a consulta cruza
 * `acordo_parcela` (1,25M linhas) com o LATERAL de atribuição.
 */
export function resolverJanela(
  entrada: { janela?: string | null; inicio?: string | null; fim?: string | null },
  hoje: string,
): ResultadoPeriodo {
  const chave = entrada.janela ?? "prox15";
  if (!ehChaveJanela(chave)) {
    return { ok: false, erro: `Janela desconhecida: ${chave}.` };
  }

  if (chave !== "personalizado") {
    const dias: Record<Exclude<ChaveJanela, "personalizado">, number> = {
      prox7: 6,
      prox15: 14,
      prox30: 29,
      prox60: 59,
    };
    return { ok: true, inicio: hoje, fim: somarDias(hoje, dias[chave]) };
  }

  const { inicio, fim } = entrada;
  if (!inicio || !fim) {
    return { ok: false, erro: "Informe a data inicial e a data final." };
  }
  for (const [rotulo, valor] of [
    ["inicial", inicio],
    ["final", fim],
  ] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return { ok: false, erro: `Data ${rotulo} deve estar no formato AAAA-MM-DD.` };
    }
    if (!dataDoCalendario(valor)) {
      return {
        ok: false,
        erro: `Data ${rotulo} não existe no calendário: ${valor}.`,
      };
    }
  }
  if (inicio > fim) {
    return { ok: false, erro: "A data inicial não pode ser depois da final." };
  }
  const dias = diasNoIntervalo(inicio, fim);
  if (dias > MAX_DIAS) {
    return {
      ok: false,
      erro: `A janela é de ${dias} dias; o máximo é ${MAX_DIAS} (o CRM é o banco de produção).`,
    };
  }
  return { ok: true, inicio, fim };
}

/** Os dias de um intervalo, em ordem — "2026-08-14", "2026-08-15", … */
export function diasDoIntervalo(inicio: string, fim: string): string[] {
  const total = diasNoIntervalo(inicio, fim);
  if (total <= 0) return [];
  const dias: string[] = [];
  for (let i = 0; i < total; i++) dias.push(somarDias(inicio, i));
  return dias;
}

/** "2026-08-13" → "13/08/2026". */
export function formatarDiaBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Como o período aparece escrito na tela. */
export function rotuloPeriodo(inicio: string, fim: string, hoje: string): string {
  if (inicio === fim) {
    if (inicio === hoje) return `hoje, ${formatarDiaBr(inicio)}`;
    if (inicio === somarDias(hoje, -1)) return `ontem, ${formatarDiaBr(inicio)}`;
    return formatarDiaBr(inicio);
  }
  return `${formatarDiaBr(inicio)} a ${formatarDiaBr(fim)}`;
}
