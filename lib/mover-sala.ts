// Movimentação de sala — ponto único de verdade.
//
// Regra do conjunto: o funcionário não muda de sala sozinho. Ao movê-lo, os
// COMPUTADORES dele vão junto, porque na prática a estação inteira muda de
// lugar com a pessoa. O CELULAR acompanha por definição: ele não tem sala
// própria (a sala dele é a do dono), então nada precisa ser atualizado.
//
// Usado pela página da sala (POST /api/salas/mover) e pela edição do
// funcionário (PATCH /api/funcionarios/[id]) — as duas portas de entrada
// precisam se comportar igual.
import { prisma } from "@/lib/prisma";

export type EventoMovimentacao = {
  entidade: "Computador" | "Funcionario";
  id: string;
  descricao: string;
};

export type ResultadoMovimentacao = {
  computadores: number;
  funcionarios: number;
  eventos: EventoMovimentacao[];
};

// Como a sala aparece no texto da auditoria.
function rotuloSala(nome: string | null | undefined, semSala: string): string {
  return nome ? `"${nome}"` : semSala;
}

// Filtro "quem ainda NÃO está no destino" — usado para não gerar evento de
// auditoria de quem já está lá.
//
// CUIDADO COM NULL: `NOT: { salaId: "x" }` vira `salaId <> 'x'` no SQL, que é
// NULO (não verdadeiro) quando salaId é NULL. Ou seja, sozinho ele DEIXARIA DE
// FORA justamente quem está sem sala — o caso mais comum ao trazer algo para
// uma sala. Por isso o OR explícito com `salaId: null`.
export function filtroForaDoDestino(destinoSalaId: string | null) {
  if (destinoSalaId === null) {
    // Indo para "sem sala": só interessa quem hoje TEM sala.
    return { NOT: { salaId: null } };
  }
  return {
    OR: [{ salaId: null }, { NOT: { salaId: destinoSalaId } }],
  };
}

// Resolve o nome do destino (e valida que ele existe). Devolve null quando o
// id foi informado mas não existe — o chamador responde 404.
export async function rotuloDestino(
  destinoSalaId: string | null,
): Promise<string | null> {
  if (!destinoSalaId) return "estoque sem sala";
  const destino = await prisma.sala.findUnique({
    where: { id: destinoSalaId },
    select: { nome: true },
  });
  return destino ? `"${destino.nome}"` : null;
}

export async function moverParaSala(params: {
  destinoSalaId: string | null;
  destinoNome: string;
  computadorIds?: string[];
  funcionarioIds?: string[];
}): Promise<ResultadoMovimentacao> {
  const { destinoSalaId, destinoNome } = params;
  const funcionarioIds = params.funcionarioIds ?? [];
  const explicitos = params.computadorIds ?? [];

  // Os computadores de quem está sendo movido entram na leva automaticamente.
  const doConjunto = funcionarioIds.length
    ? await prisma.computador.findMany({
        where: { funcionarioId: { in: funcionarioIds } },
        select: { id: true },
      })
    : [];
  const alvoComputadores = [
    ...new Set([...explicitos, ...doConjunto.map((c) => c.id)]),
  ];

  // Estado ANTES, para a auditoria registrar origem → destino. Quem já está no
  // destino é descartado: mover para onde já se está não é um evento.
  const [computadoresAntes, funcionariosAntes] = await Promise.all([
    alvoComputadores.length
      ? prisma.computador.findMany({
          where: {
            id: { in: alvoComputadores },
            ...filtroForaDoDestino(destinoSalaId),
          },
          select: { id: true, identificador: true, sala: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    funcionarioIds.length
      ? prisma.funcionario.findMany({
          where: {
            id: { in: funcionarioIds },
            ...filtroForaDoDestino(destinoSalaId),
          },
          select: { id: true, nome: true, sala: { select: { nome: true } } },
        })
      : Promise.resolve([]),
  ]);

  const idsComputadores = computadoresAntes.map((c) => c.id);
  const idsFuncionarios = funcionariosAntes.map((f) => f.id);

  // Atômico: a pessoa e o conjunto dela mudam de sala juntos, ou nada muda.
  await prisma.$transaction([
    prisma.computador.updateMany({
      where: { id: { in: idsComputadores } },
      data: { salaId: destinoSalaId },
    }),
    prisma.funcionario.updateMany({
      where: { id: { in: idsFuncionarios } },
      data: { salaId: destinoSalaId },
    }),
  ]);

  const eventos: EventoMovimentacao[] = [
    ...funcionariosAntes.map((f) => ({
      entidade: "Funcionario" as const,
      id: f.id,
      descricao: `Funcionário "${f.nome}" movido de ${rotuloSala(
        f.sala?.nome,
        "sem sala",
      )} para ${destinoNome}`,
    })),
    ...computadoresAntes.map((c) => ({
      entidade: "Computador" as const,
      id: c.id,
      descricao: `Computador "${c.identificador}" movido de ${rotuloSala(
        c.sala?.nome,
        "estoque sem sala",
      )} para ${destinoNome}`,
    })),
  ];

  return {
    computadores: idsComputadores.length,
    funcionarios: idsFuncionarios.length,
    eventos,
  };
}
