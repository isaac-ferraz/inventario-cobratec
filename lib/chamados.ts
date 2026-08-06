// Regras de negócio do chamado — funções PURAS, sem banco.
//
// Ficam aqui (e não espalhadas nas rotas) porque são o coração do módulo: quem
// pode ver o quê, quem pode mudar o quê, e para onde o status pode ir. Sendo
// puras, dá para testá-las exaustivamente sem subir servidor nem banco.

export const STATUS = [
  "aberto",
  "em_andamento",
  "aguardando",
  "resolvido",
  "fechado",
] as const;
export type Status = (typeof STATUS)[number];

export const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export type Papel = "ADMIN" | "OPERADOR";

export const ROTULO_STATUS: Record<Status, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando: "Aguardando retorno",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

// Status que ainda pedem ação do TI — usado nos KPIs e no filtro "em aberto".
export const STATUS_ABERTOS: Status[] = ["aberto", "em_andamento", "aguardando"];

export function estaEmAberto(status: string): boolean {
  return (STATUS_ABERTOS as string[]).includes(status);
}

// Só o dono do chamado ou um administrador podem vê-lo.
export function podeVerChamado(
  papel: Papel,
  usuarioId: string,
  solicitanteId: string,
): boolean {
  return papel === "ADMIN" || usuarioId === solicitanteId;
}

// Nota interna é conversa do TI sobre o chamado: o solicitante nunca a recebe.
// Filtrar aqui (e não só esconder na tela) evita que a nota vá no JSON.
export function filtrarMensagens<T extends { interna: boolean }>(
  papel: Papel,
  mensagens: T[],
): T[] {
  return papel === "ADMIN" ? mensagens : mensagens.filter((m) => !m.interna);
}

// Transições que o OPERADOR pode fazer no próprio chamado. Ele não gerencia a
// fila do TI (não assume, não prioriza, não põe em andamento) — só confirma que
// o problema acabou, ou avisa que voltou.
const TRANSICOES_OPERADOR: Partial<Record<Status, Status[]>> = {
  // Concordou que resolveu → encerra.
  resolvido: ["fechado", "aberto"],
  // Voltou a acontecer → reabre.
  fechado: ["aberto"],
};

export type ResultadoTransicao =
  | { permitido: true }
  | { permitido: false; motivo: string };

export function podeMudarStatus(
  papel: Papel,
  atual: string,
  novo: string,
): ResultadoTransicao {
  if (!(STATUS as readonly string[]).includes(novo)) {
    return { permitido: false, motivo: "Status inválido." };
  }
  if (atual === novo) return { permitido: true };

  // O admin conduz o chamado livremente: a fila é dele.
  if (papel === "ADMIN") return { permitido: true };

  const permitidos = TRANSICOES_OPERADOR[atual as Status] ?? [];
  if (permitidos.includes(novo as Status)) return { permitido: true };

  return {
    permitido: false,
    motivo:
      atual === "resolvido" || atual === "fechado"
        ? "Você pode apenas fechar ou reabrir este chamado."
        : "Só o TI pode mudar o andamento do chamado. Você pode responder na conversa.",
  };
}

// Campos que o operador NUNCA controla, nem no próprio chamado: eles organizam
// o trabalho do TI, não o pedido.
const CAMPOS_SO_DO_ADMIN = ["prioridade", "responsavelId", "categoria"] as const;

export function camposProibidos(papel: Papel, corpo: object): string[] {
  if (papel === "ADMIN") return [];
  return CAMPOS_SO_DO_ADMIN.filter((c) => c in corpo);
}

// `resolvidoEm` marca quando o problema foi dado como resolvido. Sai de novo se
// o chamado for reaberto, senão a métrica de tempo de resolução mente.
export function calcularResolvidoEm(
  statusNovo: string,
  resolvidoEmAtual: Date | null,
  agora: Date,
): Date | null {
  if (statusNovo === "resolvido" || statusNovo === "fechado") {
    return resolvidoEmAtual ?? agora;
  }
  return null;
}
