import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Autenticação Basic OPCIONAL.
//
// Por padrão fica DESLIGADA — a decisão 9 (docs/decisoes.md) assume ferramenta
// interna em LAN restrita, sem login. Para ativar, defina as DUAS variáveis de
// ambiente BASIC_AUTH_USER e BASIC_AUTH_PASS (ver .env.example). Aí todas as
// rotas passam a exigir o login do navegador — útil se o app for exposto além
// da rede do escritório ou se quiserem uma barreira simples.
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // Sempre descarta um `x-usuario` vindo do cliente: esse cabeçalho identifica
  // o ator na trilha de auditoria e só pode ser definido aqui (anti-spoofing).
  const headers = new Headers(req.headers);
  headers.delete("x-usuario");

  // Sem credenciais configuradas → auth desligada (comportamento padrão).
  if (!user || !pass) {
    return NextResponse.next({ request: { headers } });
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // atob existe no runtime Edge do middleware (Buffer não).
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u === user && p === pass) {
      // Propaga o usuário autenticado para a trilha de auditoria.
      headers.set("x-usuario", u);
      return NextResponse.next({ request: { headers } });
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Inventario Cobratec"' },
  });
}

// Aplica a tudo, exceto assets estáticos do Next, o favicon e o /api/health
// (o healthcheck do container roda sem credenciais).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
