import { NextResponse } from "next/server";
import { COOKIE_SESSAO } from "@/lib/sessao";

// GET /api/sessao/encerrar — apaga o cookie e devolve para o login.
//
// Existe porque um Server Component NÃO pode escrever cookie durante a
// renderização. Quando o layout descobre que o cookie é válido mas o usuário
// não vale mais (inativado ou removido), ele redireciona para cá: aqui, em um
// Route Handler, o cookie pode ser apagado de fato — senão a pessoa ficaria
// presa em um ciclo de redirecionamento carregando um cookie zumbi.
export async function GET(req: Request): Promise<NextResponse> {
  const destino = new URL("/login", req.url);
  destino.searchParams.set("encerrada", "1");
  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set(COOKIE_SESSAO, "", { path: "/", maxAge: 0 });
  return resposta;
}
