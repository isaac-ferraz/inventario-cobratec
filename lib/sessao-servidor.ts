// Leitura da sessão no servidor (Server Components e Route Handlers).
//
// Diferença para lib/sessao.ts: aqui existe banco. O cookie assinado prova
// QUEM é, mas não prova que a pessoa continua valendo — ela pode ter sido
// inativada ou rebaixada de ADMIN para OPERADOR depois que o cookie foi
// emitido. Por isso toda leitura server-side reconfere no banco: é o ponto de
// revogação que o middleware (Edge, sem Prisma) não consegue fazer.
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { COOKIE_SESSAO, lerSessao, type Sessao } from "@/lib/sessao";
import type { Escopo, Papel } from "@/lib/supervisao";

export type UsuarioSessao = {
  id: string;
  login: string;
  nome: string;
  papel: Papel;
  senhaProvisoria: boolean;
  funcionarioId: string | null;
  /**
   * Salas pelas quais responde. Vem do banco a cada requisição, junto com o
   * papel — nunca do cookie: tirar uma sala do supervisor precisa valer na
   * requisição seguinte, e não quando a sessão dele expirar.
   */
  salaIds: string[];
};

async function confirmarNoBanco(
  sessao: Sessao | null,
): Promise<UsuarioSessao | null> {
  if (!sessao) return null;
  const usuario = await prisma.usuario.findUnique({
    where: { id: sessao.uid },
    select: {
      id: true,
      login: true,
      nome: true,
      papel: true,
      ativo: true,
      senhaProvisoria: true,
      funcionarioId: true,
      supervisoes: { select: { salaId: true } },
    },
  });
  if (!usuario || !usuario.ativo) return null;

  // O papel VALE O DO BANCO, não o do cookie: rebaixar alguém tem efeito na
  // requisição seguinte, sem esperar a sessão expirar. Papel desconhecido cai
  // no menos privilegiado — se alguém escrever lixo na coluna, o resultado é
  // acesso de operador, nunca de admin.
  const papel: Papel =
    usuario.papel === "ADMIN"
      ? "ADMIN"
      : usuario.papel === "SUPERVISOR"
        ? "SUPERVISOR"
        : "OPERADOR";

  return {
    id: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    papel,
    senhaProvisoria: usuario.senhaProvisoria,
    funcionarioId: usuario.funcionarioId,
    // Só o supervisor usa isto; para os outros papéis a lista fica vazia mesmo
    // que sobre algum vínculo antigo no banco.
    salaIds:
      papel === "SUPERVISOR" ? usuario.supervisoes.map((s) => s.salaId) : [],
  };
}

/** Escopo pronto para as regras de lib/supervisao.ts. */
export function escopoDe(u: UsuarioSessao): Escopo {
  return { id: u.id, papel: u.papel, salaIds: u.salaIds };
}

// Para páginas (Server Components) — lê o cookie da requisição atual.
export async function sessaoAtual(): Promise<UsuarioSessao | null> {
  const token = cookies().get(COOKIE_SESSAO)?.value;
  return confirmarNoBanco(await lerSessao(token));
}

// Para Route Handlers — lê o cookie do Request recebido.
export async function sessaoDaRequisicao(
  req: Request,
): Promise<UsuarioSessao | null> {
  const cabecalho = req.headers.get("cookie") ?? "";
  const token = cabecalho
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE_SESSAO}=`))
    ?.slice(COOKIE_SESSAO.length + 1);
  return confirmarNoBanco(await lerSessao(token));
}
