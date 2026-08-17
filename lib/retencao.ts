// Política de retenção — quanto tempo o dado fica.
//
// Só decisão, nenhum I/O: quem apaga é `lib/chat-purga.ts`. A separação é a
// mesma de `lib/relatorios.ts` (o recorte) para `lib/relatorios-cobranca.ts` (a
// consulta), e pela mesma razão — aritmética de data erra em silêncio e por
// isso precisa de teste, e teste de coisa que apaga banco tem que rodar sem
// banco.
//
// ─────────────────────────────── por que existe ───────────────────────────────
//
// O app guarda dado pessoal de terceiro: telefone do devedor, dossiê congelado
// com saldo e CPF mascarado, áudio e foto que ele mandou. Até aqui não havia
// política nenhuma — o dado entrava e ficava, e o único apagamento era o
// `DELETE` manual, admin a admin, conversa a conversa. Guardar para sempre não
// é neutro: é a escolha mais arriscada das disponíveis, tomada por omissão.
//
// O comentário do schema em `ConversaMensagem.midiaArquivo` já dizia que o
// anexo "pode ser purgado sem perder o histórico". Isto é aquilo, escrito.

/** Padrão da janela de conversa, em dias. Meio ano — ver `configRetencao`. */
export const CONVERSAS_DIAS_PADRAO = 180;

/** Padrão da janela de auditoria, em dias (dois anos). */
export const AUDITORIA_DIAS_PADRAO = 730;

/**
 * Piso da janela de conversa.
 *
 * Trinta dias não é um limite técnico, é um freio contra o dedo escorregando no
 * `.env`: `RETENCAO_CONVERSAS_DIAS=3` apagaria a conversa da semana passada, e
 * o erro só apareceria quando alguém fosse procurar a prova de um acordo.
 */
export const CONVERSAS_DIAS_MINIMO = 30;

export type ModoPurga = "seco" | "ativo";

export type ConfigRetencao = {
  conversasDias: number;
  auditoriaDias: number;
  /**
   * `seco` relata o que apagaria sem apagar. É o padrão, e continua sendo até
   * alguém trocar a variável de propósito: a primeira execução de uma rotina
   * que apaga tem que ser conferida por gente, e um padrão destrutivo faria a
   * conferência acontecer depois do estrago.
   */
  modo: ModoPurga;
};

function inteiro(valor: string | undefined, padrao: number, minimo: number): number {
  const n = Number((valor ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < minimo) return padrao;
  return n;
}

export function configRetencao(
  env: Record<string, string | undefined> = process.env,
): ConfigRetencao {
  return {
    conversasDias: inteiro(
      env.RETENCAO_CONVERSAS_DIAS,
      CONVERSAS_DIAS_PADRAO,
      CONVERSAS_DIAS_MINIMO,
    ),
    auditoriaDias: inteiro(env.RETENCAO_AUDITORIA_DIAS, AUDITORIA_DIAS_PADRAO, 90),
    modo: env.PURGA_MODO?.trim() === "ativo" ? "ativo" : "seco",
  };
}

/**
 * O instante antes do qual a conversa encerrada sai.
 *
 * Ancorado em `encerradaEm` e não em `ultimaMensagemEm`: a contagem começa
 * quando o atendimento acabou, não quando o devedor parou de responder. Uma
 * conversa que ficou aberta seis meses sem fala não é uma conversa vencida — é
 * uma conversa que ninguém encerrou, e apagá-la esconderia o problema em vez de
 * resolvê-lo.
 */
export function limiteConversas(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * 86_400_000);
}

/** O instante antes do qual o evento de auditoria sai. */
export function limiteAuditoria(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * 86_400_000);
}

export type ContagemPurga = {
  conversas: number;
  mensagens: number;
  anexos: number;
  orfaos: number;
  auditoria: number;
};

export const PURGA_VAZIA: ContagemPurga = {
  conversas: 0,
  mensagens: 0,
  anexos: 0,
  orfaos: 0,
  auditoria: 0,
};

export function nadaAPurgar(c: ContagemPurga): boolean {
  return (
    c.conversas === 0 && c.mensagens === 0 && c.anexos === 0 && c.orfaos === 0 &&
    c.auditoria === 0
  );
}

/**
 * O texto do aviso. Números, nunca conteúdo.
 *
 * Nem telefone entra aqui, ao contrário da auditoria do apagamento manual (onde
 * o telefone é o que identifica o registro que sumiu). Este texto sai por
 * WhatsApp para o celular de alguém: uma lista de números de devedor viajando
 * por um gateway não-oficial seria trocar um risco de LGPD por outro maior.
 */
export function resumoPurga(c: ContagemPurga, modo: ModoPurga): string {
  const partes: string[] = [];
  if (c.conversas) partes.push(`${c.conversas} conversa(s) e ${c.mensagens} mensagem(ns)`);
  if (c.anexos) partes.push(`${c.anexos} anexo(s)`);
  if (c.orfaos) partes.push(`${c.orfaos} arquivo(s) órfão(s)`);
  if (c.auditoria) partes.push(`${c.auditoria} evento(s) de auditoria`);
  const lista = partes.length ? partes.join(", ") : "nada";
  return modo === "seco"
    ? `Modo seco: nada foi apagado. Seriam removidos ${lista}. ` +
        `Para valer, defina PURGA_MODO=ativo no .env e recrie o container.`
    : `Removidos ${lista}.`;
}
