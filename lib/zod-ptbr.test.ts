// As mensagens que o TI lê quando erra o preenchimento.
//
// Antes, erro de TIPO caía no texto embutido do zod, em inglês, e ia direto para
// a tela: "Expected string, received number", "Invalid enum value. Expected
// 'ativo' | ...". Este arquivo trava a tradução — e trava também o contrário: a
// mensagem escrita no schema continua ganhando do map.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { computadorSchema, usuarioSchema } from "@/lib/validations";
import { aplicarMensagensPtBr } from "@/lib/zod-ptbr";

// Importar validations já aplica o map; a chamada aqui é só para o caso deste
// arquivo rodar isolado.
aplicarMensagensPtBr();

/** Primeira mensagem de erro de um parse que deve falhar. */
function mensagem(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>, valor: unknown): string {
  const r = schema.safeParse(valor);
  expect(r.success).toBe(false);
  return r.success ? "" : r.error.errors[0].message;
}

describe("mensagens em português", () => {
  it("campo que nem veio é 'obrigatório', não 'Required'", () => {
    expect(mensagem(z.object({ a: z.string() }), {})).toBe("Campo obrigatório");
  });

  it("tipo errado descreve os tipos em português", () => {
    const m = mensagem(z.object({ a: z.string() }), { a: 123 });
    expect(m).toBe("Esperado texto, recebido número");
    expect(m).not.toMatch(/Expected|received/);
  });

  it("enum fora da lista mostra as opções sem inglês", () => {
    const m = mensagem(computadorSchema, {
      identificador: "PAT-1",
      situacao: "explodido",
    });
    expect(m).toMatch(/^Valor inválido\. Use um destes: /);
    expect(m).toContain("ativo");
    expect(m).not.toMatch(/Invalid enum value/);
  });

  it("fração onde se espera inteiro fala português", () => {
    const m = mensagem(z.object({ n: z.number().int() }), { n: 2.7 });
    expect(m).not.toMatch(/Expected integer/);
    expect(m).toMatch(/inteiro/i);
  });

  it("texto curto/longo conta caracteres", () => {
    expect(mensagem(z.object({ a: z.string().min(3) }), { a: "ab" })).toBe(
      "Precisa de ao menos 3 caracteres",
    );
    expect(mensagem(z.object({ a: z.string().max(2) }), { a: "abc" })).toBe(
      "Precisa de no máximo 2 caracteres",
    );
  });

  it("lista usa 'itens' em vez de 'caracteres'", () => {
    expect(
      mensagem(z.object({ a: z.array(z.string()).min(2) }), { a: ["x"] }),
    ).toBe("Precisa de ao menos 2 itens");
  });

  it("e-mail inválido não vem como 'Invalid email'", () => {
    expect(mensagem(z.object({ a: z.string().email() }), { a: "xyz" })).toBe(
      "E-mail inválido",
    );
  });
});

describe("mensagem do schema tem precedência", () => {
  it("a frase escrita no campo continua valendo", () => {
    expect(mensagem(computadorSchema, { identificador: "" })).toBe(
      "Identificador é obrigatório",
    );
  });

  it("inclusive nos enums com errorMap próprio", () => {
    expect(
      mensagem(usuarioSchema, {
        login: "alguem",
        nome: "Alguém",
        senha: "senha12345",
        papel: "DEUS",
      }),
    ).toBe("Papel deve ser ADMIN, SUPERVISOR, COBRANCA ou OPERADOR");
  });
});
