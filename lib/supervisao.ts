// Escopo do SUPERVISOR — quem responde por uma ou mais salas.
//
// PRINCÍPIO: o supervisor não tem "menos permissões que o admin"; ele tem as
// mesmas permissões sobre um RECORTE. Por isso toda pergunta aqui é da forma
// "isto pertence a alguma sala minha?", e não "ele pode editar?".
//
// Tudo neste arquivo é função pura: recebe o escopo e o registro, devolve
// sim/não. As rotas de API montam o `where` do Prisma a partir daqui, para a
// filtragem acontecer NO BANCO — filtrar depois de ler já teria vazado o dado
// para a memória do processo e, num descuido, para o JSON.

export type Papel = "ADMIN" | "SUPERVISOR" | "OPERADOR";

export const PAPEIS: Papel[] = ["ADMIN", "SUPERVISOR", "OPERADOR"];

export const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor de sala",
  OPERADOR: "Operador",
};

/** Quem está pedindo, e sobre quais salas manda. */
export type Escopo = {
  id: string;
  papel: Papel;
  /** Vazio para ADMIN e OPERADOR; as salas supervisionadas para SUPERVISOR. */
  salaIds: string[];
};

export function ehAdmin(e: Escopo): boolean {
  return e.papel === "ADMIN";
}

export function ehSupervisor(e: Escopo): boolean {
  return e.papel === "SUPERVISOR";
}

/**
 * Supervisor sem nenhuma sala atribuída não enxerga nada — e isso é de
 * propósito. O papel só ganha sentido depois que o TI diz por qual sala ele
 * responde; até lá, "supervisor de nada" é a leitura correta.
 */
export function temEscopo(e: Escopo): boolean {
  return ehAdmin(e) || (ehSupervisor(e) && e.salaIds.length > 0);
}

export function alcancaSala(e: Escopo, salaId: string | null | undefined): boolean {
  if (ehAdmin(e)) return true;
  if (!ehSupervisor(e) || !salaId) return false;
  return e.salaIds.includes(salaId);
}

// ─────────────────── O que "pertence à sala" para cada coisa ───────────────────

type ComSala = { salaId?: string | null };
type ComDono = { funcionario?: { salaId?: string | null } | null };

/**
 * Um COMPUTADOR é da sala quando a máquina está nela **ou** quando o dono senta
 * nela. Os dois casos importam: máquina de estoque guardada na sala não tem
 * dono, e a máquina que viajou com a pessoa pode estar com a sala desatualizada.
 * Cobrir só um dos lados deixaria buracos justamente onde o cadastro está torto
 * — que é quando o supervisor mais precisa enxergar.
 */
export function alcancaComputador(
  e: Escopo,
  pc: ComSala & ComDono,
): boolean {
  if (ehAdmin(e)) return true;
  return alcancaSala(e, pc.salaId) || alcancaSala(e, pc.funcionario?.salaId);
}

/**
 * CELULAR não tem sala: ele anda com a pessoa (decisão 15). Então o alcance é o
 * do dono. Aparelho em estoque, sem dono, é do TI.
 */
export function alcancaCelular(e: Escopo, cel: ComDono): boolean {
  if (ehAdmin(e)) return true;
  return alcancaSala(e, cel.funcionario?.salaId);
}

export function alcancaFuncionario(e: Escopo, f: ComSala): boolean {
  if (ehAdmin(e)) return true;
  return alcancaSala(e, f.salaId);
}

/**
 * CHAMADO: o da sala dele, mais os que ele mesmo abriu (um supervisor também
 * pede suporte para si).
 */
export function alcancaChamado(
  e: Escopo,
  chamado: { salaId?: string | null; solicitanteId?: string | null },
): boolean {
  if (ehAdmin(e)) return true;
  if (chamado.solicitanteId && chamado.solicitanteId === e.id) return true;
  return alcancaSala(e, chamado.salaId);
}

/**
 * MOVER equipamento: origem **e** destino precisam estar no escopo. Sem a trava
 * no destino, o supervisor poderia empurrar uma máquina para uma sala que não é
 * dele e, com isso, deixar de enxergá-la — perdendo o próprio equipamento de
 * vista sem que ninguém tenha decidido isso.
 */
export function podeMover(
  e: Escopo,
  origemSalaId: string | null | undefined,
  destinoSalaId: string | null | undefined,
): boolean {
  if (ehAdmin(e)) return true;
  if (!ehSupervisor(e)) return false;
  return alcancaSala(e, origemSalaId) && alcancaSala(e, destinoSalaId);
}

// ─────────────────────────── Filtros para o Prisma ───────────────────────────
//
// Devolvem um fragmento de `where` para a consulta já sair filtrada do banco.
// `undefined` significa "sem restrição" (admin).

/** Sentinela que não casa com nada — para supervisor sem sala atribuída. */
const NADA = { id: { in: [] as string[] } };

export function filtroComputador(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (!temEscopo(e)) return NADA;
  return {
    OR: [
      { salaId: { in: e.salaIds } },
      { funcionario: { salaId: { in: e.salaIds } } },
    ],
  };
}

export function filtroCelular(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (!temEscopo(e)) return NADA;
  return { funcionario: { salaId: { in: e.salaIds } } };
}

export function filtroFuncionario(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (!temEscopo(e)) return NADA;
  return { salaId: { in: e.salaIds } };
}

export function filtroSala(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (!temEscopo(e)) return NADA;
  return { id: { in: e.salaIds } };
}

export function filtroChamado(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (ehSupervisor(e)) {
    // Sem sala atribuída ainda restam os chamados que ele mesmo abriu.
    if (e.salaIds.length === 0) return { solicitanteId: e.id };
    return { OR: [{ salaId: { in: e.salaIds } }, { solicitanteId: e.id }] };
  }
  // Operador: só os próprios.
  return { solicitanteId: e.id };
}

/** Manutenções alcançam o supervisor pelo equipamento envolvido. */
export function filtroManutencao(e: Escopo): Record<string, unknown> | undefined {
  if (ehAdmin(e)) return undefined;
  if (!temEscopo(e)) return NADA;
  return {
    OR: [
      { computador: filtroComputador(e) },
      { celular: filtroCelular(e) },
    ],
  };
}
