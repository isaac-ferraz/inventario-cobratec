// Autorização das rotas de API.
//
// PRINCÍPIO: o middleware NÃO é a fronteira de segurança. Ele é um portão de
// conveniência (redireciona quem não está logado, esconde o que o papel não
// usa), mas roda antes e longe da regra de negócio. Cada rota que lê ou escreve
// dado sensível chama uma das funções daqui no seu início — assim, um erro de
// matcher no middleware não vira vazamento de dados.
//
// São três níveis:
//   exigirSessao  — qualquer autenticado (usado pelos chamados).
//   exigirEscopo  — admin OU supervisor; devolve o escopo de salas, e a rota
//                   filtra por ele. É o portão do inventário.
//   exigirAdmin   — só administrador: telas globais (usuários, tipos, catálogo,
//                   auditoria, depósito, exportação).
import { erro } from "@/lib/api";
import {
  sessaoDaRequisicao,
  escopoDe,
  type UsuarioSessao,
} from "@/lib/sessao-servidor";
import type { Escopo } from "@/lib/supervisao";

type Autorizado = { usuario: UsuarioSessao };
type ComEscopo = { usuario: UsuarioSessao; escopo: Escopo };
type Negado = { resposta: ReturnType<typeof erro> };

// Qualquer usuário autenticado (admin, supervisor ou operador).
export async function exigirSessao(
  req: Request,
): Promise<Autorizado | Negado> {
  const usuario = await sessaoDaRequisicao(req);
  if (!usuario) {
    return { resposta: erro("Autenticação necessária.", 401) };
  }
  return { usuario };
}

// Só administrador. Quem está autenticado mas sem permissão recebe 403 (e não
// 401): ele está identificado, apenas não pode.
export async function exigirAdmin(req: Request): Promise<Autorizado | Negado> {
  const r = await exigirSessao(req);
  if ("resposta" in r) return r;
  if (r.usuario.papel !== "ADMIN") {
    return {
      resposta: erro("Acesso restrito ao administrador do sistema.", 403),
    };
  }
  return r;
}

/**
 * Admin ou supervisor — o portão do inventário. Devolve o `escopo`, que a rota
 * usa para filtrar (`filtro*` de lib/supervisao.ts) ou para conferir um registro
 * específico (`alcanca*`).
 *
 * ATENÇÃO: passar por aqui NÃO basta. Para o admin o escopo é irrestrito, mas
 * para o supervisor a rota ainda precisa aplicar o filtro — sem isso ele veria
 * o parque inteiro.
 */
export async function exigirEscopo(
  req: Request,
): Promise<ComEscopo | Negado> {
  const r = await exigirSessao(req);
  if ("resposta" in r) return r;
  const { papel } = r.usuario;
  if (papel !== "ADMIN" && papel !== "SUPERVISOR") {
    return {
      resposta: erro("Acesso restrito ao TI e aos supervisores de sala.", 403),
    };
  }
  return { usuario: r.usuario, escopo: escopoDe(r.usuario) };
}

/**
 * 404 do recurso fora do escopo — e não 403.
 *
 * Mesmo motivo do chamado alheio (decisão 20): responder "sem permissão" para
 * um id confirmaria que aquele patrimônio existe. Para quem não alcança, ele
 * simplesmente não existe.
 */
export function foraDoEscopo(o: string = "Registro") {
  return erro(`${o} não encontrado.`, 404);
}
