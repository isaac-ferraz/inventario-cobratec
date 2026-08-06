// Ciclo de vida do equipamento — funções PURAS, sem banco.
//
// Duas ideias que não se confundem:
//  - `situacao` é o ESTADO do equipamento (onde ele está na vida útil).
//  - `Manutencao` é um EVENTO com começo e fim (uma ida ao conserto).
// Um equipamento em manutenção tem situacao = "manutencao" E uma manutenção em
// aberto. O estado dá a leitura rápida; o evento dá o histórico.
//
// Nada disso se confunde com "em uso × estoque", que continua sendo derivado de
// ter ou não funcionário: uma máquina pode estar em manutenção e continuar
// atribuída a alguém.

export const SITUACOES = ["ativo", "manutencao", "reserva", "descartado"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  ativo: "Ativo",
  manutencao: "Em manutenção",
  reserva: "Reserva",
  descartado: "Descartado",
};

export const TIPOS_MANUTENCAO = ["corretiva", "preventiva"] as const;
export type TipoManutencao = (typeof TIPOS_MANUTENCAO)[number];

export const ROTULO_TIPO_MANUTENCAO: Record<TipoManutencao, string> = {
  corretiva: "Corretiva (quebrou)",
  preventiva: "Preventiva (revisão)",
};

// Equipamento descartado não conta como parque ativo em lugar nenhum.
export function contaNoParque(situacao: string): boolean {
  return situacao !== "descartado";
}

// --- Garantia ---

export type EstadoGarantia = "sem" | "vencida" | "vencendo" | "vigente";

// Janela de aviso: 90 dias é tempo hábil para acionar a assistência antes de a
// garantia acabar.
export const DIAS_AVISO_GARANTIA = 90;

export function estadoGarantia(
  garantiaAte: Date | string | null | undefined,
  agora: Date = new Date(),
): EstadoGarantia {
  if (!garantiaAte) return "sem";
  const fim = garantiaAte instanceof Date ? garantiaAte : new Date(garantiaAte);
  if (Number.isNaN(fim.getTime())) return "sem";

  const diasRestantes = Math.ceil(
    (fim.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diasRestantes < 0) return "vencida";
  if (diasRestantes <= DIAS_AVISO_GARANTIA) return "vencendo";
  return "vigente";
}

export function diasAteGarantia(
  garantiaAte: Date | string,
  agora: Date = new Date(),
): number {
  const fim = garantiaAte instanceof Date ? garantiaAte : new Date(garantiaAte);
  return Math.ceil((fim.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
}

// --- Manutenção ---

export function estaEmManutencao(concluidaEm: Date | string | null): boolean {
  return concluidaEm === null || concluidaEm === undefined;
}

// Ao ABRIR uma manutenção, o equipamento vai para "manutencao" — mas nunca
// mexemos num equipamento descartado: ele saiu do parque, e reanimá-lo por um
// registro de conserto seria mentira.
export function situacaoAoAbrirManutencao(atual: string): Situacao | null {
  if (atual === "descartado") return null;
  return "manutencao";
}

// Ao CONCLUIR, o equipamento volta para o estado normal — a menos que alguém
// já o tenha marcado como descartado (conserto que não valeu a pena) ou
// reserva. Só desfazemos o que a própria manutenção causou.
export function situacaoAoConcluirManutencao(atual: string): Situacao | null {
  return atual === "manutencao" ? "ativo" : null;
}

// Custo total de uma lista de manutenções (ignora as sem valor informado).
export function somarCustos(
  manutencoes: { custo?: number | null }[],
): number {
  return manutencoes.reduce((total, m) => total + (m.custo ?? 0), 0);
}

export function formatarMoeda(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
