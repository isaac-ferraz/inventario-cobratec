// Validação (zod) de toda escrita que chega na camada de API.
import { z } from "zod";
import { PRIORIDADES, STATUS } from "@/lib/chamados";

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
  papel: z.enum(["ADMIN", "OPERADOR"], {
    errorMap: () => ({ message: "Papel deve ser ADMIN ou OPERADOR" }),
  }),
  ativo: z.boolean().optional(),
  funcionarioId: relacaoOpcional,
});

export const trocaSenhaSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual").max(200),
  novaSenha: senhaNova,
});

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
});

// Quantidade inteira, não-negativa e com teto (evita entrada absurda/abuso).
const quantidadeOpcional = z.coerce
  .number({ invalid_type_error: "Quantidade deve ser um número" })
  .int("Quantidade deve ser um número inteiro")
  .min(0, "Quantidade não pode ser negativa")
  .max(1_000_000, "Quantidade muito alta")
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
