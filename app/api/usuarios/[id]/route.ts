import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usuarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import { gerarHashSenha } from "@/lib/senha";
import { registrarAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

const CAMPOS_PUBLICOS = {
  id: true,
  login: true,
  nome: true,
  papel: true,
  ativo: true,
  senhaProvisoria: true,
  funcionarioId: true,
  criadoEm: true,
  ultimoAcessoEm: true,
  supervisoes: { select: { sala: { select: { id: true, nome: true } } } },
} as const;

// Trava anti-tranca: o sistema não pode ficar sem NENHUM administrador ativo,
// senão ninguém mais entra para consertar. Vale para rebaixar, inativar e
// remover.
async function deixariaSemAdmin(
  id: string,
  virariaAdminAtivo: boolean,
): Promise<boolean> {
  if (virariaAdminAtivo) return false;
  const alvo = await prisma.usuario.findUnique({
    where: { id },
    select: { papel: true, ativo: true },
  });
  if (!alvo || alvo.papel !== "ADMIN" || !alvo.ativo) return false;
  const adminsAtivos = await prisma.usuario.count({
    where: { papel: "ADMIN", ativo: true },
  });
  return adminsAtivos <= 1;
}

/** Papel gravado hoje — usado quando o PATCH mexe em salas sem mexer no papel. */
async function papelAtual(id: string): Promise<string> {
  const u = await prisma.usuario.findUnique({
    where: { id },
    select: { papel: true },
  });
  return u?.papel ?? "OPERADOR";
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, usuarioSchema.partial());
  if ("resposta" in r) return r.resposta;

  const papelNovo = r.data.papel;
  const ativoNovo = r.data.ativo;
  const mexeEmAcesso = papelNovo !== undefined || ativoNovo !== undefined;

  try {
    if (mexeEmAcesso) {
      const atual = await prisma.usuario.findUnique({
        where: { id: params.id },
        select: { papel: true, ativo: true },
      });
      if (!atual) return erro("Usuário não encontrado.", 404);

      const seguiraAdminAtivo =
        (papelNovo ?? atual.papel) === "ADMIN" && (ativoNovo ?? atual.ativo);

      if (await deixariaSemAdmin(params.id, seguiraAdminAtivo)) {
        return erro(
          "Este é o último administrador ativo. Promova outro usuário a administrador antes de rebaixar ou inativar este.",
          409,
        );
      }
    }

    const dados: Record<string, unknown> = {};
    if (r.data.login !== undefined) dados.login = r.data.login;
    if (r.data.nome !== undefined) dados.nome = r.data.nome;
    if (papelNovo !== undefined) dados.papel = papelNovo;
    if (ativoNovo !== undefined) dados.ativo = ativoNovo;
    if ("funcionarioId" in r.data) {
      dados.funcionarioId = r.data.funcionarioId || null;
    }
    // Senha informada aqui é RESET feito pelo admin: volta a ser provisória
    // para o dono ser cobrado a trocar.
    if (r.data.senha) {
      dados.senhaHash = await gerarHashSenha(r.data.senha);
      dados.senhaProvisoria = true;
    }

    // Salas do supervisor: trocar o conjunto inteiro é mais simples e mais
    // seguro que casar diferenças — "estas são as salas dele agora".
    //
    // Rebaixar de SUPERVISOR limpa os vínculos: deixá-los pendurados faria as
    // salas antigas voltarem a valer sozinhas se alguém promovesse a pessoa de
    // novo meses depois, sem ninguém ter decidido isso.
    const mexeEmSalas = "salaIds" in r.data || papelNovo !== undefined;
    let salasNovas: string[] | null = null;
    if (mexeEmSalas) {
      const papelFinal = papelNovo ?? (await papelAtual(params.id));
      salasNovas =
        papelFinal === "SUPERVISOR" ? [...new Set(r.data.salaIds ?? [])] : [];
    }

    const atualizado = await prisma.usuario.update({
      where: { id: params.id },
      data: {
        ...dados,
        ...(salasNovas === null
          ? {}
          : {
              supervisoes: {
                deleteMany: {},
                create: salasNovas.map((salaId) => ({ salaId })),
              },
            }),
      },
      select: CAMPOS_PUBLICOS,
    });

    const detalhes = [
      r.data.senha ? "senha redefinida" : null,
      papelNovo ? `papel = ${papelNovo}` : null,
      ativoNovo === false ? "inativado" : ativoNovo === true ? "reativado" : null,
      salasNovas
        ? `salas: ${
            atualizado.supervisoes.map((s) => s.sala.nome).join(", ") || "nenhuma"
          }`
        : null,
    ].filter(Boolean);

    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Usuario",
      entidadeId: atualizado.id,
      descricao: `Usuário "${atualizado.login}" editado${
        detalhes.length ? ` (${detalhes.join(", ")})` : ""
      }`,
    });

    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  // Remover a própria conta derrubaria a sessão de quem está agindo.
  if (auth.usuario.id === params.id) {
    return erro(
      "Você não pode remover o próprio usuário. Peça a outro administrador.",
      409,
    );
  }
  if (await deixariaSemAdmin(params.id, false)) {
    return erro(
      "Este é o último administrador ativo. Promova outro usuário a administrador antes de removê-lo.",
      409,
    );
  }

  try {
    const removido = await prisma.usuario.delete({
      where: { id: params.id },
      select: { id: true, login: true },
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Usuario",
      entidadeId: removido.id,
      descricao: `Usuário "${removido.login}" removido`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
