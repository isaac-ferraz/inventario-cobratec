import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESSAO, lerSessao } from "@/lib/sessao";

// Portão de rota. Roda no runtime EDGE (sem Prisma), então valida a sessão
// apenas por criptografia — a checagem de "usuário ainda ativo / papel atual"
// acontece no servidor, em lib/sessao-servidor.ts.
//
// ATENÇÃO: isto NÃO é a fronteira de segurança das APIs. Cada rota chama
// exigirSessao/exigirAdmin (lib/autorizacao.ts). Aqui é conveniência de
// navegação e uma primeira barreira.
//
// Substitui a antiga Basic Auth opcional (decisão 9): o sistema agora tem login
// próprio com papéis, e o acesso anônimo deixou de existir.

// Rotas que o OPERADOR pode acessar. Ele existe no sistema para uma coisa só:
// abrir e acompanhar os chamados dele.
const PERMITIDO_OPERADOR = [
  "/chamados",
  "/trocar-senha",
  "/api/chamados",
  "/api/sessao",
  "/api/senha",
];

// Rotas que o SUPERVISOR de sala alcança. Ele enxerga e edita o inventário das
// salas dele — mas QUAIS registros são dele o middleware não tem como saber
// (roda no Edge, sem banco). Aqui é só a porta; o recorte por sala acontece em
// cada rota, via exigirEscopo + os filtros de lib/supervisao.ts.
//
// Fora desta lista de propósito: /usuarios, /tipos (catálogo global),
// /auditoria, /deposito (suprimentos não têm sala) e /api/export — a planilha
// sai com o parque inteiro, e recortá-la é outro trabalho.
const PERMITIDO_SUPERVISOR = [
  ...PERMITIDO_OPERADOR,
  "/", // dashboard, recortado pelas salas dele
  "/computadores",
  "/celulares",
  "/funcionarios",
  "/salas",
  "/manutencoes",
  "/api/computadores",
  "/api/celulares",
  "/api/componentes",
  "/api/funcionarios",
  "/api/salas",
  "/api/manutencoes",
  "/api/tipos", // leitura: o formulário de componente precisa do catálogo
];

function ehPublica(pathname: string): boolean {
  return (
    pathname === "/login" ||
    // login, logout e o encerramento de sessão zumbi precisam ser alcançáveis
    pathname === "/api/sessao" ||
    pathname.startsWith("/api/sessao/") ||
    pathname === "/api/health" // healthcheck do container roda sem credencial
  );
}

function casa(lista: string[], pathname: string): boolean {
  return lista.some(
    (base) =>
      pathname === base ||
      // "/" é prefixo de tudo: sem esta guarda, liberar a raiz liberaria o site
      // inteiro para quem só deveria ver o painel.
      (base !== "/" && pathname.startsWith(`${base}/`)),
  );
}

function podeNavegar(papel: string, pathname: string): boolean {
  if (papel === "ADMIN") return true;
  if (papel === "SUPERVISOR") return casa(PERMITIDO_SUPERVISOR, pathname);
  return casa(PERMITIDO_OPERADOR, pathname);
}

/** Para onde mandar quem bateu numa porta que não é dele. */
function telaInicial(papel: string): string {
  return papel === "SUPERVISOR" ? "/" : "/chamados";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Sempre descarta cabeçalhos de identidade vindos do cliente: eles definem o
  // ator da auditoria e só podem ser escritos aqui (anti-spoofing).
  const headers = new Headers(req.headers);
  headers.delete("x-usuario");
  headers.delete("x-papel");

  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);

  if (ehPublica(pathname)) {
    // Quem já está logado não precisa ver a tela de login de novo.
    if (pathname === "/login" && sessao) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next({ request: { headers } });
  }

  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { erro: "Autenticação necessária." },
        { status: 401 },
      );
    }
    const destino = new URL("/login", req.url);
    // Guarda para onde a pessoa queria ir, e volta para lá após entrar.
    destino.searchParams.set("de", pathname);
    return NextResponse.redirect(destino);
  }

  if (!podeNavegar(sessao.papel, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { erro: "Acesso restrito ao administrador do sistema." },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL(telaInicial(sessao.papel), req.url));
  }

  // Identidade confirmada segue para a trilha de auditoria.
  headers.set("x-usuario", sessao.login);
  headers.set("x-papel", sessao.papel);
  return NextResponse.next({ request: { headers } });
}

// Aplica a tudo, exceto assets estáticos do Next e o favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
