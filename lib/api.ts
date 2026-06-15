// Helpers para padronizar respostas e tratamento de erros na camada de API.
import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";

export function erro(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

// Valida o corpo da requisição com um schema zod e retorna os dados tipados.
export async function validarCorpo<T>(
  req: Request,
  schema: ZodSchema<T>,
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
