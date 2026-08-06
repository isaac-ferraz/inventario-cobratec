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

// Rota pública (ver middleware): é por aqui que se entra e se sai.

// POST /api/sessao — login
export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, loginSchema);
  if ("resposta" in r) return r.resposta;

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

    const papel = usuario.papel === "ADMIN" ? "ADMIN" : "OPERADOR";
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
