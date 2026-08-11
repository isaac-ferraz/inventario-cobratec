import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usuarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import { gerarHashSenha } from "@/lib/senha";
import { registrarAuditoria } from "@/lib/auditoria";

// `senhaHash` NUNCA sai daqui. Seleção explícita em vez de findMany solto,
// para um campo novo no schema não vazar sem querer.
const CAMPOS_PUBLICOS = {
  id: true,
  login: true,
  nome: true,
  papel: true,
  ativo: true,
  senhaProvisoria: true,
  funcionarioId: true,
  siscobraUsucod: true,
  criadoEm: true,
  ultimoAcessoEm: true,
  funcionario: { select: { id: true, nome: true, cargo: true } },
  supervisoes: { select: { sala: { select: { id: true, nome: true } } } },
} as const;

// Vínculo com salas só faz sentido para SUPERVISOR. Guardar sala em admin ou
// operador criaria um estado que não significa nada e que voltaria a valer se
// o papel mudasse depois — melhor zerar na hora.
function salasDoPapel(papel: string, salaIds: string[] | undefined): string[] {
  if (papel !== "SUPERVISOR") return [];
  return [...new Set(salaIds ?? [])];
}

// Mesmo raciocínio das salas, para o código de operadora no Siscobra: ele só
// significa alguma coisa para COBRANCA. Deixá-lo pendurado num papel que não
// atende devedor guardaria uma atribuição que ninguém usa — e que voltaria a
// valer sozinha no dia em que o papel mudasse.
function usucodDoPapel(
  papel: string,
  usucod: number | null | undefined,
): number | null {
  if (papel !== "COBRANCA") return null;
  return usucod ?? null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const usuarios = await prisma.usuario.findMany({
    select: CAMPOS_PUBLICOS,
    orderBy: [{ ativo: "desc" }, { login: "asc" }],
  });
  return NextResponse.json(usuarios);
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, usuarioSchema);
  if ("resposta" in r) return r.resposta;

  // Na criação a senha é obrigatória (na edição ela é opcional = "manter").
  if (!r.data.senha) {
    return erro("Informe a senha inicial do usuário.", 400);
  }

  try {
    const criado = await prisma.usuario.create({
      data: {
        login: r.data.login,
        nome: r.data.nome,
        papel: r.data.papel,
        ativo: r.data.ativo ?? true,
        funcionarioId: r.data.funcionarioId || null,
        siscobraUsucod: usucodDoPapel(r.data.papel, r.data.siscobraUsucod),
        senhaHash: await gerarHashSenha(r.data.senha),
        // Senha definida por outra pessoa nasce provisória: a UI cobra a troca.
        senhaProvisoria: true,
        supervisoes: {
          create: salasDoPapel(r.data.papel, r.data.salaIds).map((salaId) => ({
            salaId,
          })),
        },
      },
      select: CAMPOS_PUBLICOS,
    });

    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Usuario",
      entidadeId: criado.id,
      descricao: `Usuário "${criado.login}" criado como ${criado.papel}${
        criado.supervisoes.length
          ? ` (salas: ${criado.supervisoes.map((s) => s.sala.nome).join(", ")})`
          : ""
      }`,
    });

    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
