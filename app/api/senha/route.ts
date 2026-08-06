import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trocaSenhaSchema } from "@/lib/validations";
import { validarCorpo, erro, tratarErroPrisma } from "@/lib/api";
import { exigirSessao } from "@/lib/autorizacao";
import { gerarHashSenha, verificarSenha } from "@/lib/senha";
import { registrarAuditoria } from "@/lib/auditoria";

// POST /api/senha — troca da PRÓPRIA senha (admin ou operador).
// Exige a senha atual: sem isso, um computador deixado desbloqueado permitiria
// a qualquer um trocar a senha e tomar a conta.
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, trocaSenhaSchema);
  if ("resposta" in r) return r.resposta;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: auth.usuario.id },
      select: { senhaHash: true },
    });
    if (!usuario) return erro("Usuário não encontrado.", 404);

    const confere = await verificarSenha(r.data.senhaAtual, usuario.senhaHash);
    if (!confere) return erro("Senha atual incorreta.", 400);

    if (r.data.senhaAtual === r.data.novaSenha) {
      return erro("A nova senha precisa ser diferente da atual.", 400);
    }

    await prisma.usuario.update({
      where: { id: auth.usuario.id },
      data: {
        senhaHash: await gerarHashSenha(r.data.novaSenha),
        senhaProvisoria: false,
      },
    });

    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Usuario",
      entidadeId: auth.usuario.id,
      // Nunca registrar a senha, nem parte dela.
      descricao: `Usuário "${auth.usuario.login}" trocou a própria senha`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
