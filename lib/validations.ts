// Validação (zod) de toda escrita que chega na camada de API.
import { z } from "zod";

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

export const funcionarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200, "Nome muito longo"),
  cargo: z.string().trim().min(1, "Cargo é obrigatório").max(120, "Cargo muito longo"),
  matricula: textoOpcional,
  ativo: z.boolean().optional(),
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
  licencaWindows: textoOpcional,
  licencaMicrosoft: textoOpcional,
  contaOutlook: emailOpcional,
  // Periféricos (apenas presença)
  temMouse: z.boolean().optional(),
  temTeclado: z.boolean().optional(),
  temHeadset: z.boolean().optional(),
  // null = sem funcionário (estoque/manutenção)
  funcionarioId: z.string().trim().nullable().optional(),
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

export type FuncionarioInput = z.infer<typeof funcionarioSchema>;
export type ComputadorInput = z.infer<typeof computadorSchema>;
export type TipoComponenteInput = z.infer<typeof tipoComponenteSchema>;
export type ComponenteInput = z.infer<typeof componenteSchema>;
