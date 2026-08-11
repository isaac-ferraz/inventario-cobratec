// Mensagens PADRÃO do zod em português.
//
// POR QUE: as mensagens escritas nos schemas já estão em pt-BR, mas quando o
// TIPO é que está errado (número onde se espera texto, enum fora da lista,
// inteiro onde veio fração) o zod cai no texto embutido em inglês — e ele ia
// direto para a tela do TI, do lado de "Identificador é obrigatório":
//
//   "Expected string, received number"
//   "Invalid enum value. Expected 'ativo' | 'manutencao' | ..."
//   "Expected integer, received float"
//   "Required; Required"            (corpo vazio no login)
//
// Um error map global resolve num lugar só. Mensagem custom do schema continua
// ganhando — o map só entra quando não há uma.
import { z } from "zod";

const TIPO: Record<string, string> = {
  string: "texto",
  number: "número",
  bigint: "número inteiro",
  boolean: "sim ou não",
  array: "lista",
  object: "objeto",
  date: "data",
  integer: "número inteiro",
  float: "número",
  nan: "algo que não é número",
  undefined: "vazio",
  null: "vazio",
  function: "função",
  symbol: "símbolo",
};

function tipo(valor: unknown): string {
  const chave = String(valor);
  return TIPO[chave] ?? chave;
}

/** Plural na unidade certa: caracteres para texto, itens para lista. */
function unidade(t: unknown, quantos: number): string {
  const n = Number(quantos);
  if (t === "string") return `${n} ${n === 1 ? "caractere" : "caracteres"}`;
  if (t === "array") return `${n} ${n === 1 ? "item" : "itens"}`;
  return String(n);
}

export const mensagensPtBr: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      // undefined/null viram "obrigatório" em vez de "esperado texto, recebido
      // vazio", que é como o zod descreve um campo que nem veio.
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "Campo obrigatório" };
      }
      return {
        message: `Esperado ${tipo(issue.expected)}, recebido ${tipo(issue.received)}`,
      };

    case z.ZodIssueCode.invalid_enum_value:
      return {
        message: `Valor inválido. Use um destes: ${issue.options.join(", ")}`,
      };

    case z.ZodIssueCode.invalid_literal:
      return { message: "Valor não permitido para este campo" };

    case z.ZodIssueCode.too_small: {
      if (issue.type === "date") return { message: "Data anterior ao permitido" };
      const alvo = issue.inclusive ? "ao menos" : "mais de";
      return { message: `Precisa de ${alvo} ${unidade(issue.type, Number(issue.minimum))}` };
    }

    case z.ZodIssueCode.too_big: {
      if (issue.type === "date") return { message: "Data posterior ao permitido" };
      const alvo = issue.inclusive ? "no máximo" : "menos de";
      return { message: `Precisa de ${alvo} ${unidade(issue.type, Number(issue.maximum))}` };
    }

    case z.ZodIssueCode.not_multiple_of:
      return { message: `Precisa ser múltiplo de ${issue.multipleOf}` };

    case z.ZodIssueCode.not_finite:
      return { message: "Número fora do intervalo válido" };

    case z.ZodIssueCode.invalid_string: {
      if (issue.validation === "email") return { message: "E-mail inválido" };
      if (issue.validation === "url") return { message: "Endereço (URL) inválido" };
      if (issue.validation === "uuid") return { message: "Identificador inválido" };
      if (issue.validation === "datetime") return { message: "Data/hora inválida" };
      return { message: "Formato inválido" };
    }

    case z.ZodIssueCode.invalid_date:
      return { message: "Data inválida" };

    case z.ZodIssueCode.unrecognized_keys:
      return {
        message: `Campo não reconhecido: ${issue.keys.join(", ")}`,
      };

    case z.ZodIssueCode.invalid_union:
      return { message: "Valor inválido para este campo" };

    default:
      // Códigos raros (custom sem mensagem, intersecção, etc.). Vale mais uma
      // frase genérica em português do que o texto do zod em inglês; quando o
      // schema traz mensagem própria, o map nem é consultado.
      return { message: ctx.defaultError === "Required" ? "Campo obrigatório" : "Valor inválido" };
  }
};

let aplicado = false;

/**
 * Instala o map globalmente. Chamado uma vez por lib/validations.ts, que é
 * importado por toda rota que valida entrada — assim nenhuma rota precisa
 * lembrar de fazer isto.
 */
export function aplicarMensagensPtBr(): void {
  if (aplicado) return;
  z.setErrorMap(mensagensPtBr);
  aplicado = true;
}
