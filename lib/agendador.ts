// O relógio do app.
//
// Até aqui o sistema não tinha nenhum: tudo que ele sabia só existia quando
// alguém abria a tela. Isto é um laço de um minuto que confere, para cada
// tarefa, se já passou da hora dela hoje.
//
// ──────────────────── por que dentro do app, e não um cron ────────────────────
//
// Um cron do host ou um sidecar no compose seria mais ortodoxo. Perde para a
// realidade deste projeto: onde o app vai morar ainda não está decidido, e o
// backup é a prova do que acontece nesse caso — ele tem script pronto, unit de
// systemd escrita em `docs/backup.md`, e nunca foi agendado, porque agendar
// dependia de escolher a máquina. O que sobe junto com o container é o que
// funciona no dia em que o container subir em qualquer lugar.
//
// O preço está dito: vale UMA instância. Duas rodariam o digest duas vezes — a
// deduplicação por `chave` no `Aviso` segura o estrago, mas o desenho supõe uma
// só, exatamente como o barramento de eventos em `lib/chat-eventos.ts`.
//
// ─────────────────────────── por que grava o dia ───────────────────────────
//
// O que já rodou fica em `TarefaAgendada`, no banco, e não em memória. Um
// `docker compose restart` às 12h05 faria o digest do meio-dia sair de novo, e
// duas mensagens iguais no celular de quem decide é como se treina alguém a
// ignorar notificação.
import { prisma } from "@/lib/prisma";
import { FUSO_BRASIL } from "@/lib/relatorios";
import { TAREFAS } from "@/lib/tarefas";

/**
 * Quanto tempo depois do horário a tarefa ainda vale a pena.
 *
 * Sem esta janela, subir o container às 19h dispararia o digest do meio-dia —
 * "produção parcial do dia" chegando depois do expediente não é informação
 * atrasada, é informação errada. Com ela, o horário perdido fica perdido, que é
 * o comportamento honesto.
 *
 * Duas horas e não quinze minutos porque a queda que este app precisa
 * sobreviver é a de energia do escritório, não a de um deploy.
 */
export const JANELA_MINUTOS = 120;

export type Relogio = { dia: string; hora: number; minuto: number };

/** Que horas são no Brasil — o container sobe em UTC. */
export function agoraNoBrasil(agora: Date = new Date()): Relogio {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const de = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return {
    dia: `${de("year")}-${de("month")}-${de("day")}`,
    // "24" aparece em algumas implementações para meia-noite com hour12:false.
    hora: Number(de("hour")) % 24,
    minuto: Number(de("minute")),
  };
}

/**
 * Já passou da hora e ainda não rodou hoje?
 *
 * Pura de propósito — é a única parte do agendador que tem como errar em
 * silêncio, e testar horário sem congelar o relógio do processo só dá certo se
 * ele entrar como argumento.
 */
export function deveRodar(
  tarefa: { hora: number; minuto: number },
  agora: Relogio,
  ultimoDia: string | null,
): boolean {
  if (ultimoDia === agora.dia) return false;
  const atraso =
    agora.hora * 60 + agora.minuto - (tarefa.hora * 60 + tarefa.minuto);
  return atraso >= 0 && atraso <= JANELA_MINUTOS;
}

/** Roda uma tarefa e registra o resultado, dê no que der. */
export async function executar(nome: string): Promise<void> {
  const tarefa = TAREFAS.find((t) => t.nome === nome);
  if (!tarefa) return;

  const inicio = Date.now();
  const dia = agoraNoBrasil().dia;
  let resultado = "ok";
  let detalhe = "";
  try {
    detalhe = await tarefa.executar();
  } catch (e) {
    resultado = "erro";
    detalhe = (e as Error).message ?? "falha desconhecida";
    console.error(`[agendador] ${nome}:`, detalhe);
  }

  // O registro é gravado mesmo no erro, e `ultimoDia` também: uma tarefa que
  // falha e é reagendada a cada minuto até a janela fechar bate no CRM cem
  // vezes com o mesmo problema. Falhou hoje, tenta amanhã — e o erro fica na
  // coluna para alguém ver.
  try {
    await prisma.tarefaAgendada.upsert({
      where: { nome },
      create: {
        nome,
        ultimoDia: dia,
        ultimaExecucao: new Date(),
        ultimoResultado: resultado,
        ultimoDetalhe: detalhe.slice(0, 500),
        duracaoMs: Date.now() - inicio,
      },
      update: {
        ultimoDia: dia,
        ultimaExecucao: new Date(),
        ultimoResultado: resultado,
        ultimoDetalhe: detalhe.slice(0, 500),
        duracaoMs: Date.now() - inicio,
      },
    });
  } catch (e) {
    console.error("[agendador] não gravou o registro:", (e as Error).message);
  }
}

/** Uma passada: confere todas as tarefas e roda as que estão na hora. */
export async function tique(agora: Date = new Date()): Promise<string[]> {
  const relogio = agoraNoBrasil(agora);
  const registros = await prisma.tarefaAgendada.findMany({
    select: { nome: true, ultimoDia: true },
  });
  const dias = new Map(registros.map((r) => [r.nome, r.ultimoDia]));

  const rodadas: string[] = [];
  for (const tarefa of TAREFAS) {
    if (!deveRodar(tarefa, relogio, dias.get(tarefa.nome) ?? null)) continue;
    rodadas.push(tarefa.nome);
    // Em série, e não em paralelo: as tarefas de cobrança varrem o CRM de
    // produção, e o pool tem quatro conexões. Duas delas juntas competiriam com
    // a operação atendendo.
    await executar(tarefa.nome);
  }
  return rodadas;
}

let laco: NodeJS.Timeout | null = null;

/**
 * Liga o relógio. Chamado uma vez, pelo `instrumentation.ts`.
 *
 * Idempotente porque o hook de instrumentação pode rodar mais de uma vez em
 * desenvolvimento (recompilação), e dois laços dobrariam tudo.
 */
export function iniciarAgendador(): void {
  if (laco) return;
  console.info(
    `[agendador] ligado · ${TAREFAS.map((t) => `${t.nome} ${String(t.hora).padStart(2, "0")}:${String(t.minuto).padStart(2, "0")}`).join(" · ")}`,
  );
  laco = setInterval(() => {
    void tique().catch((e) =>
      console.error("[agendador] tique falhou:", (e as Error).message),
    );
  }, 60_000);
  // Não segura o processo vivo sozinho: um `docker stop` não deve esperar o
  // próximo minuto para desligar.
  laco.unref?.();
}

export function pararAgendador(): void {
  if (laco) clearInterval(laco);
  laco = null;
}
