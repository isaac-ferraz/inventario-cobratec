// Validação (zod) de toda escrita que chega na camada de API.
import { z } from "zod";
import { PRIORIDADES, STATUS } from "@/lib/chamados";
import { SITUACOES, TIPOS_MANUTENCAO } from "@/lib/ativos";
import { aplicarMensagensPtBr } from "@/lib/zod-ptbr";

// Traduz as mensagens padrão do zod. Aqui, e não em cada rota, porque toda rota
// que valida entrada importa este arquivo.
aplicarMensagensPtBr();

// Campo de texto opcional. Regras:
//  - ausente (undefined)  -> não mexe no campo (importante no PATCH parcial)
//  - string vazia ("")    -> null (permite LIMPAR o campo pela edição)
//  - texto                -> o próprio valor
const textoOpcional = z
  .string()
  .trim()
  .max(2000, "Texto excede o limite de 2000 caracteres")
  .optional()
  .transform((v) => (v === "" ? null : v));

// E-mail opcional: mesmas regras de limpeza, mas valida formato quando preenchido.
const emailOpcional = textoOpcional.refine(
  (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  "Conta Outlook deve ser um e-mail válido",
);

// Id de relação opcional: "" (ou null) significa "sem vínculo" e vira null.
// Mesma semântica de limpeza dos campos de texto.
const relacaoOpcional = z
  .string()
  .trim()
  .max(60, "Identificador inválido")
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));

// Mínimo de senha: 8 caracteres. É uma ferramenta interna em LAN, mas a senha
// agora protege o cofre de credenciais — não dá para aceitar "123".
const SENHA_MIN = 8;
const senhaNova = z
  .string()
  .min(SENHA_MIN, `A senha precisa de ao menos ${SENHA_MIN} caracteres`)
  .max(200, "Senha muito longa");

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Informe o login").max(60, "Login muito longo"),
  senha: z.string().min(1, "Informe a senha").max(200, "Senha muito longa"),
});

export const usuarioSchema = z.object({
  // Sem espaço/acento: o login é digitado e comparado exatamente.
  login: z
    .string()
    .trim()
    .min(3, "Login precisa de ao menos 3 caracteres")
    .max(60, "Login muito longo")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou _"),
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),
  senha: senhaNova.optional(), // ausente na edição = mantém a senha atual
  papel: z.enum(["ADMIN", "SUPERVISOR", "COBRANCA", "OPERADOR"], {
    errorMap: () => ({
      message: "Papel deve ser ADMIN, SUPERVISOR, COBRANCA ou OPERADOR",
    }),
  }),
  ativo: z.boolean().optional(),
  funcionarioId: relacaoOpcional,
  // Código da operadora no Siscobra (`usuario.usucod`). Só vale para COBRANCA —
  // a API zera nos outros papéis. Inteiro positivo: lá é uma sequência, e 0 ou
  // negativo não identificaria ninguém. `null` limpa o vínculo.
  //
  // `coerce` como em `quantidade`: a célula de uma planilha é sempre texto, e a
  // importação entrega a linha a ESTE schema (decisão 26) em vez de converter
  // por fora. `null` não passa pela coerção — o `.nullable()` corta antes —,
  // então "sem código" continua distinguível de zero.
  siscobraUsucod: z.coerce
    .number({ invalid_type_error: "Código do Siscobra deve ser um número" })
    .int("Código do Siscobra deve ser um número inteiro")
    .positive("Código do Siscobra deve ser maior que zero")
    .max(99999999, "Código do Siscobra fora de faixa")
    .nullable()
    .optional(),
  // Salas pelas quais o supervisor responde. Sem limite de quantas, nem de
  // quantos supervisores tem cada sala. Ausente = não mexe no vínculo atual;
  // lista vazia = tira todas.
  salaIds: z.array(z.string().min(1)).max(100).optional(),
});

export const trocaSenhaSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual").max(200),
  novaSenha: senhaNova,
});

// --- Ciclo de vida do ativo ---

/**
 * A data existe no calendário? O formato AAAA-MM-DD sozinho não garante nada:
 * "2026-13-01" e "2026-02-31" passam pela regex e o JS os aceita de dois jeitos
 * ruins — "2026-13-01" vira Invalid Date (e o Prisma estourava em 500) e
 * "2026-02-31" ROLA para 03/03, gravando silenciosamente uma data que ninguém
 * digitou. Reconstruímos a data em UTC e conferimos se os três componentes
 * sobreviveram: se o dia mudou, ele não existia.
 */
function dataDoCalendario(iso: string): Date | null {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0, 0));
  const sobreviveu =
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia;
  return sobreviveu ? d : null;
}

// Data vinda de <input type="date"> ("2026-08-06"). Regras iguais às de texto:
// ausente não mexe, "" limpa. A data é fixada ao MEIO-DIA UTC de propósito:
// com 00:00 UTC, quem está em fuso negativo (Brasil) veria o dia anterior.
//
// O <input type="date"> do Chrome já recusa data impossível, mas a API é porta
// aberta para script de importação e outros clientes — a validação mora aqui.
const dataOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" || v == null ? (v === "" ? null : undefined) : v))
  .superRefine((v, ctx) => {
    if (v == null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data deve estar no formato AAAA-MM-DD",
      });
      return;
    }
    if (!dataDoCalendario(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Data inexistente no calendário: ${v} (confira dia e mês)`,
      });
    }
  })
  .transform((v) => (v == null ? v : dataDoCalendario(v)));

const valorOpcional = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return v === "" ? null : undefined;
    // Aceita "1.234,56" (formato que o TI digita) e "1234.56".
    const n =
      typeof v === "number"
        ? v
        : Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((v) => v == null || (!Number.isNaN(v) && v >= 0 && v <= 10_000_000), {
    message: "Valor inválido",
  });

// Campos de ciclo de vida compartilhados por computador e celular.
const camposCicloVida = {
  situacao: z.enum(SITUACOES).optional(),
  dataAquisicao: dataOpcional,
  notaFiscal: textoOpcional,
  garantiaAte: dataOpcional,
  valorCompra: valorOpcional,
};

export const manutencaoSchema = z
  .object({
    computadorId: relacaoOpcional,
    celularId: relacaoOpcional,
    tipo: z.enum(TIPOS_MANUTENCAO, {
      errorMap: () => ({ message: "Tipo deve ser corretiva ou preventiva" }),
    }),
    descricao: z
      .string()
      .trim()
      .min(1, "Descreva o que está sendo feito")
      .max(2000, "Descrição muito longa"),
    fornecedor: textoOpcional,
    custo: valorOpcional,
    chamadoId: relacaoOpcional,
    observacoes: textoOpcional,
    // Enviar concluidaEm fecha a manutenção; "" reabre.
    concluidaEm: dataOpcional,
  })
  .refine(
    (d) => Boolean(d.computadorId) !== Boolean(d.celularId),
    "Informe exatamente um equipamento: computador OU celular",
  );

// Na edição o equipamento não muda (a manutenção pertence àquele aparelho).
export const manutencaoUpdateSchema = manutencaoSchema
  .innerType()
  .omit({ computadorId: true, celularId: true })
  .partial();

// --- Chamados (helpdesk) ---
// A lista de status/prioridades vive em lib/chamados.ts (regra de negócio);
// aqui só validamos a entrada contra ela.
export const chamadoSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, "Descreva o problema em poucas palavras (mín. 3 caracteres)")
    .max(200, "Título muito longo"),
  descricao: z
    .string()
    .trim()
    .min(1, "Conte o que está acontecendo")
    .max(5000, "Descrição muito longa"),
  categoria: textoOpcional,
  prioridade: z.enum(PRIORIDADES).optional(),
  // Equipamento relacionado (opcional): ajuda o TI a saber onde mexer.
  computadorId: relacaoOpcional,
  celularId: relacaoOpcional,
});

export const chamadoUpdateSchema = z.object({
  status: z.enum(STATUS).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  categoria: textoOpcional,
  // "" limpa o responsável (devolve o chamado para a fila).
  responsavelId: relacaoOpcional,
});

export const chamadoMensagemSchema = z.object({
  corpo: z
    .string()
    .trim()
    .min(1, "Escreva a mensagem")
    .max(5000, "Mensagem muito longa"),
  // Nota interna do TI. A rota ignora este campo quando quem envia é operador.
  interna: z.boolean().optional(),
});

export const salaSchema = z.object({
  nome: z.string().trim().min(1, "Nome da sala é obrigatório").max(120, "Nome muito longo"),
  predio: textoOpcional,
  piso: textoOpcional,
  // Ordem de exibição: inteiro pequeno, aceita número ou string do formulário.
  ordem: z.coerce
    .number({ invalid_type_error: "Ordem deve ser um número" })
    .int("Ordem deve ser um número inteiro")
    .min(0, "Ordem não pode ser negativa")
    .max(9999, "Ordem muito alta")
    .optional(),
  ativa: z.boolean().optional(),
  observacoes: textoOpcional,
});

// Movimentação em lote de/para uma sala. `destinoSalaId` null = tirar da sala.
// O teto de 500 ids evita um payload absurdo (o escritório inteiro cabe folgado).
const listaDeIds = z
  .array(z.string().trim().min(1, "Identificador inválido").max(60))
  .max(500, "Selecione no máximo 500 itens por vez")
  .optional();

export const moverParaSalaSchema = z
  .object({
    destinoSalaId: z.string().trim().max(60).nullable(),
    computadorIds: listaDeIds,
    funcionarioIds: listaDeIds,
  })
  .refine(
    (d) => (d.computadorIds?.length ?? 0) + (d.funcionarioIds?.length ?? 0) > 0,
    "Selecione ao menos um computador ou funcionário para mover",
  );

export const funcionarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),
  cargo: z.string().trim().min(1, "Cargo é obrigatório").max(120, "Cargo muito longo"),
  loginSiscobra: textoOpcional,
  senhaSiscobra: textoOpcional,
  loginVonix: textoOpcional,
  senhaVonix: textoOpcional,
  ativo: z.boolean().optional(),
  // null = sem sala definida
  salaId: relacaoOpcional,
});

export const computadorSchema = z.object({
  identificador: z
    .string()
    .trim()
    .min(1, "Identificador é obrigatório")
    .max(200, "Identificador muito longo"),
  apelido: textoOpcional,
  observacoes: textoOpcional,
  loginPadrao: textoOpcional,
  senha: textoOpcional,
  licencaWindows: textoOpcional,
  licencaMicrosoft: textoOpcional,
  contaOutlook: emailOpcional,
  // Periféricos (apenas presença)
  temMouse: z.boolean().optional(),
  temTeclado: z.boolean().optional(),
  temHeadset: z.boolean().optional(),
  // null = sem funcionário (estoque/manutenção)
  funcionarioId: z.string().trim().nullable().optional(),
  // null = sem sala definida
  salaId: relacaoOpcional,
  ...camposCicloVida,
});

export const celularSchema = z.object({
  identificador: z
    .string()
    .trim()
    .min(1, "Identificador é obrigatório")
    .max(200, "Identificador muito longo"),
  apelido: textoOpcional,
  numero: textoOpcional,
  operadora: textoOpcional,
  imei: textoOpcional,
  observacoes: textoOpcional,
  // null = sem funcionário (estoque/manutenção)
  funcionarioId: z.string().trim().nullable().optional(),
  ...camposCicloVida,
});

// Teto de estoque. Exportado porque o ajuste rápido (± no depósito) precisa do
// MESMO limite: o caminho do delta não o respeitava e aceitava gravar
// 1.000.000.000 unidades de um cabo HDMI.
export const LIMITE_QUANTIDADE = 1_000_000;

// Quantidade inteira, não-negativa e com teto (evita entrada absurda/abuso).
const quantidadeOpcional = z.coerce
  .number({ invalid_type_error: "Quantidade deve ser um número" })
  .int("Quantidade deve ser um número inteiro")
  .min(0, "Quantidade não pode ser negativa")
  .max(LIMITE_QUANTIDADE, "Quantidade muito alta")
  .optional();

export const itemDepositoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(200, "Nome muito longo"),
  categoria: textoOpcional,
  quantidade: quantidadeOpcional,
  quantidadeMinima: quantidadeOpcional,
  localizacao: textoOpcional,
  observacoes: textoOpcional,
});

// Importação de CSV. O texto do arquivo vem no corpo (não multipart): o parser é
// nosso e roda no servidor, então uma string basta — e a mesma rota serve para
// script. Tetos: 2 MB de texto e 1000 linhas por vez, para uma planilha
// gigante não prender o processo numa transação só.
export const LIMITE_CSV_BYTES = 2 * 1024 * 1024;
export const LIMITE_CSV_LINHAS = 1000;

export const importarSchema = z.object({
  entidade: z.string().min(1, "Escolha o que importar"),
  csv: z
    .string()
    .min(1, "O arquivo está vazio")
    .max(LIMITE_CSV_BYTES, "Arquivo muito grande (máximo 2 MB)"),
  // "criar" recusa quem já existe; "atualizar" também atualiza o que já existe.
  modo: z.enum(["criar", "atualizar"]).default("criar"),
  // false = só a prévia (não escreve nada).
  aplicar: z.boolean().default(false),
  // true = grava as linhas boas e ignora as com erro.
  ignorarErros: z.boolean().default(false),
});

export const tipoComponenteSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Nome do tipo é obrigatório")
    .max(120, "Nome do tipo muito longo"),
});

export const componenteSchema = z.object({
  computadorId: z.string().trim().min(1, "Computador é obrigatório"),
  tipoId: z.string().trim().min(1, "Tipo é obrigatório"),
  descricao: z
    .string()
    .trim()
    .min(1, "Descrição é obrigatória")
    .max(500, "Descrição muito longa"),
  // Campos livres adicionais; aceita objeto JSON qualquer, mas limitado para
  // não virar vetor de abuso (até 50 campos).
  especificacoes: z
    .record(z.any())
    .refine(
      (obj) => Object.keys(obj).length <= 50,
      "Especificações: no máximo 50 campos",
    )
    .nullable()
    .optional(),
});

// Para edição de componente o computador não muda
export const componenteUpdateSchema = componenteSchema.partial({
  computadorId: true,
});

// --- Conversas com devedor (cobrança) ---

// O que o n8n entrega no webhook a cada mensagem que passa pelo WhatsApp.
//
// `telefone` cru: quem normaliza é `normalizarTelefone` (lib/conversas.ts), para
// existir uma definição só de "qual conversa é esta". O schema não tenta
// adivinhar formato — o gateway manda E.164 e a operadora digita como quiser.
export const conversaWebhookSchema = z.object({
  telefone: z.string().trim().min(10, "Telefone inválido").max(30),
  // pushName do WhatsApp. Não é identificação: qualquer um escreve o que quiser.
  nome: z.string().trim().max(200).nullable().optional(),
  autor: z.enum(["devedor", "bot"], {
    errorMap: () => ({ message: "Autor deve ser devedor ou bot" }),
  }),
  corpo: z.string().trim().min(1, "Mensagem vazia").max(5000, "Mensagem muito longa"),
  // Id da mensagem no gateway. Chega aqui para a reentrega do webhook não
  // duplicar a fala do devedor — a trava real é o UNIQUE no banco.
  waId: z.string().trim().max(200).nullable().optional(),

  // ── identificação (só quando o devedor confirmou CPF **e** nascimento) ──
  // O n8n manda os três juntos ou nenhum: meia identificação destravaria valor
  // sem prova, que é exatamente o que `podeRevelarValores` impede.
  siscobraDevcod: z.coerce.number().int().positive().nullable().optional(),
  siscobraCarcod: z.coerce.number().int().positive().nullable().optional(),
  carteira: textoOpcional,
  identificado: z.boolean().optional(),

  // ── escalonamento ──
  // Quando o robô desiste (pediu humano, saiu da regra, cliente irritado).
  escalar: z.boolean().optional(),
  motivoEscalonamento: z.string().trim().max(200).nullable().optional(),

  // Dossiê do Siscobra como objeto livre — o formato é do n8n, e travar o
  // schema aqui obrigaria a mexer neste arquivo a cada campo novo da consulta.
  // Vira JSON em texto na gravação, como `Componente.especificacoes`.
  dossie: z.record(z.any()).nullable().optional(),
});

export const conversaMensagemSchema = z.object({
  corpo: z
    .string()
    .trim()
    .min(1, "Escreva a mensagem")
    .max(5000, "Mensagem muito longa"),
});

export const conversaSituacaoSchema = z.object({
  situacao: z.enum(["bot", "fila", "humana", "encerrada"], {
    errorMap: () => ({
      message: "Situação deve ser bot, fila, humana ou encerrada",
    }),
  }),
});

export type ManutencaoInput = z.infer<typeof manutencaoSchema>;
export type ManutencaoUpdateInput = z.infer<typeof manutencaoUpdateSchema>;
export type ChamadoInput = z.infer<typeof chamadoSchema>;
export type ChamadoUpdateInput = z.infer<typeof chamadoUpdateSchema>;
export type ChamadoMensagemInput = z.infer<typeof chamadoMensagemSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UsuarioInput = z.infer<typeof usuarioSchema>;
export type TrocaSenhaInput = z.infer<typeof trocaSenhaSchema>;
export type SalaInput = z.infer<typeof salaSchema>;
export type MoverParaSalaInput = z.infer<typeof moverParaSalaSchema>;
export type FuncionarioInput = z.infer<typeof funcionarioSchema>;
export type ComputadorInput = z.infer<typeof computadorSchema>;
export type CelularInput = z.infer<typeof celularSchema>;
export type ItemDepositoInput = z.infer<typeof itemDepositoSchema>;
export type TipoComponenteInput = z.infer<typeof tipoComponenteSchema>;
export type ComponenteInput = z.infer<typeof componenteSchema>;
export type ConversaWebhookInput = z.infer<typeof conversaWebhookSchema>;
export type ConversaMensagemInput = z.infer<typeof conversaMensagemSchema>;
export type ConversaSituacaoInput = z.infer<typeof conversaSituacaoSchema>;
