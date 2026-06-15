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

  // Sem credenciais configuradas → auth desligada (comportamento atual).
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    // atob existe no runtime Edge do middleware (Buffer não).
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Inventario Cobratec"' },
  });
}

// Aplica a tudo, exceto assets estáticos do Next e o favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
