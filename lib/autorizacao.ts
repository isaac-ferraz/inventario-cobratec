// Autorização das rotas de API.
//
// PRINCÍPIO: o middleware NÃO é a fronteira de segurança. Ele é um portão de
// conveniência (redireciona quem não está logado, esconde o que o operador não
// usa), mas roda antes e longe da regra de negócio. Cada rota que lê ou escreve
// dado sensível chama `exigirAdmin`/`exigirSessao` no seu início — assim, um
// erro de matcher no middleware não vira vazamento de dados.
import { erro } from "@/lib/api";
import { sessaoDaRequisicao, type UsuarioSessao } from "@/lib/sessao-servidor";

type Autorizado = { usuario: UsuarioSessao };
type Negado = { resposta: ReturnType<typeof erro> };

// Qualquer usuário autenticado (admin ou operador).
export async function exigirSessao(
  req: Request,
): Promise<Autorizado | Negado> {
  const usuario = await sessaoDaRequisicao(req);
  if (!usuario) {
    return { resposta: erro("Autenticação necessária.", 401) };
  }
  return { usuario };
}

// Só administrador. Operador autenticado recebe 403 (e não 401): ele está
// identificado, apenas não tem permissão.
export async function exigirAdmin(req: Request): Promise<Autorizado | Negado> {
  const r = await exigirSessao(req);
  if ("resposta" in r) return r;
  if (r.usuario.papel !== "ADMIN") {
    return {
      resposta: erro(
        "Acesso restrito ao administrador do sistema.",
        403,
      ),
    };
  }
  return r;
}
