// Helpers para padronizar respostas e tratamento de erros na camada de API.
import { NextResponse } from "next/server";
import { ZodError, ZodTypeDef, type ZodType } from "zod";

export function erro(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

// Valida o corpo da requisição com um schema zod e retorna os dados tipados.
//
// O tipo de ENTRADA é `unknown` (e não igual ao de saída): schemas com
// `.transform()` — datas que chegam como "2026-08-06" e saem como Date, valores
// que chegam como "1.234,56" e saem number — têm entrada e saída diferentes, e
// `ZodSchema<T>` (que exige entrada === saída) os rejeitaria.
export async function validarCorpo<T>(
  req: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<{ data: T } | { resposta: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { resposta: erro("Corpo da requisição inválido (JSON).") };
  }
  try {
    return { data: schema.parse(json) };
  } catch (e) {
    if (e instanceof ZodError) {
      const msg = e.errors.map((x) => x.message).join("; ");
      return { resposta: erro(msg) };
    }
    return { resposta: erro("Dados inválidos.") };
  }
}

// Traduz erros comuns do Prisma para mensagens amigáveis.
export function tratarErroPrisma(e: unknown): NextResponse {
  const code = (e as { code?: string })?.code;
  if (code === "P2002") {
    return erro("Já existe um registro com esse valor único.", 409);
  }
  if (code === "P2025") {
    return erro("Registro não encontrado.", 404);
  }
  if (code === "P2003") {
    return erro("Operação viola uma relação existente.", 409);
  }
  console.error(e);
  return erro("Erro interno ao processar a requisição.", 500);
}
