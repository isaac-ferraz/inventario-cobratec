// O que o relógio roda. O relógio em si é `lib/agendador.ts`.
//
// Quatro tarefas, e cada uma existe porque um número que importa estava vivendo
// só dentro de uma tela que alguém precisava lembrar de abrir.
import { prisma } from "@/lib/prisma";
import { configSiscobra } from "@/lib/siscobra";
import { formatarDiaBr, hojeNoBrasil, somarDias } from "@/lib/relatorios";
import { acionamentosDe, acordosDo } from "@/lib/relatorios-cobranca";
import { aVencerEm, emAtrasoAte, quebrasDe } from "@/lib/relatorios-carteira";
import { registrarAviso } from "@/lib/avisos";
import { configRetencao, resumoPurga, nadaAPurgar, type ContagemPurga } from "@/lib/retencao";
import { purgarAuditoria, purgarConversas, purgarOrfaos } from "@/lib/chat-purga";

export type Tarefa = {
  nome: string;
  hora: number;
  minuto: number;
  /** Devolve o detalhe que fica em `TarefaAgendada.ultimoDetalhe`. */
  executar: () => Promise<string>;
};

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

/** Recorte sem filtro: o digest é da casa inteira. */
const TODAS = { carteira: null, equipe: null };

// ──────────────────────────── o pulso da operação ────────────────────────────

/**
 * O resumo do meio-dia: o que já fechou e o que vence hoje.
 *
 * Meio-dia e não nove da manhã porque às nove ainda não há produção para
 * relatar; e porque o que ele carrega junto — os boletos que vencem HOJE — cabe
 * na tarde de quem for cobrar.
 */
async function digestMeioDia(): Promise<string> {
  const hoje = hojeNoBrasil();
  const [acordos, aVencer] = await Promise.all([
    acordosDo({ inicio: hoje, fim: hoje, ...TODAS }),
    aVencerEm({ inicio: hoje, fim: somarDias(hoje, 6), ...TODAS }, hoje),
  ]);

  const linhas = [
    `Parcial de ${formatarDiaBr(hoje)}, até agora:`,
    "",
    `• ${num(acordos.qtd)} acordo(s) · ${moeda(acordos.valor)}`,
    `• Vence hoje: ${num(aVencer.hoje.qtd)} boleto(s) · ${moeda(aVencer.hoje.valor)}`,
    `• Próximos 7 dias: ${num(aVencer.qtd)} · ${moeda(aVencer.valor)}`,
  ];
  const topo = acordos.porOperadora[0];
  if (topo) linhas.push("", `Na frente: ${topo.rotulo} (${num(topo.qtd)})`);

  await registrarAviso({
    tipo: "carteira",
    nivel: "info",
    empurrar: true,
    titulo: `Parcial do dia · ${num(acordos.qtd)} acordos`,
    corpo: linhas.join("\n"),
    link: "/relatorios/cobranca?periodo=hoje",
    chave: `digest:meio-dia:${hoje}`,
  });
  return `${acordos.qtd} acordos, ${aVencer.hoje.qtd} vencem hoje`;
}

/**
 * O fechamento das 18h — e a única tarefa que compara.
 *
 * A comparação com as últimas quatro mesmas-feiras vem da baseline local, não
 * do CRM: o relatório tem teto de 92 dias e o banco é de produção. Sem ela o
 * digest diz "42 acordos" e ninguém sabe se 42 é um bom dia.
 */
async function digestFechamento(): Promise<string> {
  const hoje = hojeNoBrasil();
  const amanha = somarDias(hoje, 1);
  const [acordos, acionamentos, aVencer] = await Promise.all([
    acordosDo({ inicio: hoje, fim: hoje, ...TODAS }),
    acionamentosDe({ inicio: hoje, fim: hoje, ...TODAS }),
    aVencerEm({ inicio: hoje, fim: amanha, ...TODAS }, hoje),
  ]);

  const media = await mediaDasMesmasFeiras(hoje, 4);
  const comparacao =
    media === null
      ? "sem histórico suficiente para comparar (a base começa agora)"
      : media === 0
        ? "primeira vez com movimento neste dia da semana"
        : `${Math.round(((acordos.qtd - media) / media) * 100)}% ` +
          `${acordos.qtd >= media ? "acima" : "abaixo"} da média das últimas ` +
          `4 ${diaDaSemana(hoje)}s (${media.toFixed(1)})`;

  const linhas = [
    `Fechamento de ${formatarDiaBr(hoje)}:`,
    "",
    `• ${num(acordos.qtd)} acordo(s) · ${moeda(acordos.valor)}`,
    `• ${num(acionamentos.qtd)} acionamento(s) em ${num(acionamentos.devedores)} devedores`,
    `• ${comparacao}`,
    "",
    `Amanhã vencem ${num(aVencer.amanha.qtd)} boleto(s) · ${moeda(aVencer.amanha.valor)}`,
  ];

  await registrarAviso({
    tipo: "carteira",
    nivel: "info",
    empurrar: true,
    titulo: `Fechamento · ${num(acordos.qtd)} acordos · ${moeda(acordos.valor)}`,
    corpo: linhas.join("\n"),
    link: "/relatorios/cobranca?periodo=hoje",
    chave: `digest:fechamento:${hoje}`,
  });
  return `${acordos.qtd} acordos · ${comparacao}`;
}

/**
 * A fotografia da noite.
 *
 * Roda às 23h40 e não à meia-noite: à meia-noite o dia já virou no fuso e a
 * consulta pediria "hoje" quando o interessante é o dia que acabou. Vinte
 * minutos de folga também deixam a tarefa terminar antes da virada.
 *
 * É a única tarefa muda — não gera aviso. Ela existe para o digest de amanhã
 * ter com o que comparar, e um aviso por noite dizendo "gravei" seria ruído.
 */
async function fechamentoDiario(): Promise<string> {
  const hoje = hojeNoBrasil();
  const [acordos, acionamentos, aVencer, atraso, quebras] = await Promise.all([
    acordosDo({ inicio: hoje, fim: hoje, ...TODAS }),
    acionamentosDe({ inicio: hoje, fim: hoje, ...TODAS }),
    aVencerEm({ inicio: hoje, fim: somarDias(hoje, 6), ...TODAS }, hoje),
    emAtrasoAte(TODAS, hoje),
    quebrasDe(TODAS, hoje),
  ]);

  const dados = {
    acordosQtd: acordos.qtd,
    acordosValor: acordos.valor,
    acionamentosQtd: acionamentos.qtd,
    acionamentosDev: acionamentos.devedores,
    aVencer7Qtd: aVencer.qtd,
    aVencer7Valor: aVencer.valor,
    atrasoQtd: atraso.qtd,
    atrasoValor: atraso.valor,
    quebrasQtd: quebras.qtd,
    quebrasValor: quebras.valor,
  };
  // Upsert e não create: rodar duas vezes no mesmo dia (restart dentro da
  // janela) tem que sobrescrever a foto, nunca duplicá-la nem falhar.
  await prisma.fechamentoDiario.upsert({
    where: { dia: hoje },
    create: { dia: hoje, ...dados },
    update: dados,
  });
  return `${acordos.qtd} acordos · ${atraso.qtd} parcelas em atraso`;
}

/** A média de acordos das últimas `n` ocorrências do mesmo dia da semana. */
async function mediaDasMesmasFeiras(hoje: string, n: number): Promise<number | null> {
  const dias: string[] = [];
  for (let i = 1; i <= n; i++) dias.push(somarDias(hoje, -7 * i));
  const linhas = await prisma.fechamentoDiario.findMany({
    where: { dia: { in: dias } },
    select: { acordosQtd: true },
  });
  // Com menos de duas semanas de base, a "média" é uma amostra só e diria mais
  // sobre o acaso daquele dia do que sobre o de hoje.
  if (linhas.length < 2) return null;
  return linhas.reduce((s, l) => s + l.acordosQtd, 0) / linhas.length;
}

const SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
}

// ──────────────────────────── retenção ────────────────────────────

/**
 * A purga da madrugada.
 *
 * Três de manhã porque ela apaga arquivo em disco e mexe no mesmo SQLite que o
 * app usa — hora em que ninguém está atendendo. E em modo seco por padrão: a
 * primeira execução de uma rotina que apaga precisa ser conferida por gente.
 */
async function purga(): Promise<string> {
  const cfg = configRetencao();
  const seco = cfg.modo === "seco";
  const agora = new Date();

  const conversas = await purgarConversas(agora, cfg.conversasDias, seco);
  const orfaos = await purgarOrfaos(seco);
  const auditoria = await purgarAuditoria(agora, cfg.auditoriaDias, seco);

  const contagem: ContagemPurga = { ...conversas, orfaos, auditoria };
  if (nadaAPurgar(contagem)) return "nada fora da janela";

  const texto = resumoPurga(contagem, cfg.modo);
  await registrarAviso({
    tipo: "purga",
    // Alerta no modo seco de propósito: há dado vencido esperando, e a inércia
    // é justamente o risco. No modo ativo é só o relatório do que foi feito.
    nivel: seco ? "alerta" : "info",
    titulo: seco
      ? "Purga pendente de aprovação"
      : `Purga concluída · ${contagem.conversas} conversa(s)`,
    corpo:
      `${texto}\n\nJanelas em vigor: conversa encerrada há mais de ` +
      `${cfg.conversasDias} dias, auditoria com mais de ${cfg.auditoriaDias} dias.`,
    link: "/avisos",
    chave: `purga:${hojeNoBrasil()}`,
  });
  return texto;
}

/** Toda tarefa de cobrança para se o CRM não estiver configurado. */
function exigeSiscobra(fn: () => Promise<string>): () => Promise<string> {
  return async () => {
    if (!configSiscobra()) return "pulada: Siscobra não configurado";
    return fn();
  };
}

export const TAREFAS: Tarefa[] = [
  { nome: "digest-meio-dia", hora: 12, minuto: 0, executar: exigeSiscobra(digestMeioDia) },
  { nome: "digest-fechamento", hora: 18, minuto: 0, executar: exigeSiscobra(digestFechamento) },
  { nome: "fechamento-diario", hora: 23, minuto: 40, executar: exigeSiscobra(fechamentoDiario) },
  { nome: "purga", hora: 3, minuto: 0, executar: purga },
];
