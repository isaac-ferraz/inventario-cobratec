import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations";
import { validarCorpo, erro, tratarErroPrisma } from "@/lib/api";
import { verificarSenha } from "@/lib/senha";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  assinarSessao,
} from "@/lib/sessao";
import { sessaoDaRequisicao } from "@/lib/sessao-servidor";
import { papelDe } from "@/lib/supervisao";
import {
  limparTentativas,
  podarJanelas,
  registrarTentativa,
} from "@/lib/rate-limit";

// Rota pública (ver middleware): é por aqui que se entra e se sai.

// Freio de força bruta. O login protege um cofre de senhas em texto (§12 do
// README interno), então tentativa ilimitada não serve: antes daqui, 12 palpites
// seguidos passavam sem nenhum atraso. 10 erros por 5 min por (IP + login) é
// folgado para quem digitou errado e estreito para quem está adivinhando.
const LOGIN_MAXIMO = 10;
const LOGIN_JANELA_MS = 5 * 60_000;

// A chave inclui o login para que um errante não tranque os colegas atrás do
// mesmo IP/NAT, e inclui o IP para que trocar de usuário não zere o freio.
function chaveTentativa(req: Request, login: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `login|${ip}|${login.toLowerCase()}`;
}

// POST /api/sessao — login
export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, loginSchema);
  if ("resposta" in r) return r.resposta;

  const chave = chaveTentativa(req, r.data.login);
  podarJanelas(LOGIN_JANELA_MS);
  const veredito = registrarTentativa(chave, LOGIN_MAXIMO, LOGIN_JANELA_MS);
  if (!veredito.permitido) {
    return NextResponse.json(
      {
        erro: `Muitas tentativas de login. Aguarde ${veredito.esperarS}s e tente de novo.`,
      },
      { status: 429, headers: { "Retry-After": String(veredito.esperarS) } },
    );
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { login: r.data.login },
      select: {
        id: true,
        login: true,
        papel: true,
        ativo: true,
        senhaHash: true,
        senhaProvisoria: true,
      },
    });

    // Mensagem genérica e mesma trajetória de código para "login inexistente" e
    // "senha errada": dizer qual dos dois falhou entrega metade da credencial.
    // O hash é verificado mesmo sem usuário para não vazar a diferença pelo
    // tempo de resposta.
    const hashParaComparar =
      usuario?.senhaHash ??
      "scrypt$16384$00000000000000000000000000000000$00";
    const senhaConfere = await verificarSenha(r.data.senha, hashParaComparar);

    if (!usuario || !usuario.ativo || !senhaConfere) {
      return erro("Login ou senha inválidos.", 401);
    }

    // Acertou: o histórico de erros vai embora.
    limparTentativas(chave);

    // O papel do cookie tem de ser o papel do banco. Colapsar SUPERVISOR em
    // OPERADOR aqui matava o papel inteiro, porque o middleware decide a
    // navegação só com o cookie.
    const papel = papelDe(usuario.papel);
    const token = await assinarSessao({
      uid: usuario.id,
      login: usuario.login,
      papel,
    });

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcessoEm: new Date() },
    });

    const resposta = NextResponse.json({
      ok: true,
      usuario: {
        login: usuario.login,
        papel,
        senhaProvisoria: usuario.senhaProvisoria,
      },
    });
    resposta.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true, // fora do alcance de JavaScript (XSS não lê a sessão)
      sameSite: "lax",
      path: "/",
      maxAge: DURACAO_SESSAO_S,
      // Em HTTP na LAN o cookie precisa funcionar; em HTTPS ele vira secure.
      secure: new URL(req.url).protocol === "https:",
    });

    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Usuario",
      entidadeId: usuario.id,
      descricao: `Usuário "${usuario.login}" entrou no sistema`,
      atorExplicito: usuario.login,
    });

    return resposta;
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// DELETE /api/sessao — logout
export async function DELETE(req: Request): Promise<NextResponse> {
  const usuario = await sessaoDaRequisicao(req);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, "", { path: "/", maxAge: 0 });
  if (usuario) {
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Usuario",
      entidadeId: usuario.id,
      descricao: `Usuário "${usuario.login}" saiu do sistema`,
    });
  }
  return resposta;
}
