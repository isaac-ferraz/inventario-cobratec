// Autorização das rotas de API.
//
// PRINCÍPIO: o middleware NÃO é a fronteira de segurança. Ele é um portão de
// conveniência (redireciona quem não está logado, esconde o que o papel não
// usa), mas roda antes e longe da regra de negócio. Cada rota que lê ou escreve
// dado sensível chama uma das funções daqui no seu início — assim, um erro de
// matcher no middleware não vira vazamento de dados.
//
// São quatro níveis:
//   exigirSessao  — qualquer autenticado (usado pelos chamados).
//   exigirEscopo  — admin OU supervisor; devolve o escopo de salas, e a rota
//                   filtra por ele. É o portão do inventário.
//   exigirChat    — admin OU cobrança. É o portão das conversas com devedor.
//   exigirRelatorio — admin OU supervisor. É o portão dos relatórios de
//                   cobrança (produção agregada, sem dado de devedor).
//   exigirAdmin   — só administrador: telas globais (usuários, tipos, catálogo,
//                   auditoria, depósito, exportação).
//
// E um portão que não é de gente:
//   exigirServico — o n8n entregando mensagem no webhook. Token, não sessão.
import { timingSafeEqual } from "node:crypto";
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
 * Admin ou operadora de cobrança — o portão das conversas com devedor (/chat e
 * /api/chat).
 *
 * O supervisor de sala NÃO entra aqui, e isso é deliberado: ele responde pelo
 * inventário de uma sala, não pela cobrança. Conversa com devedor carrega dado
 * pessoal de terceiro (CPF, dívida) sob LGPD — o alcance dela se decide pelo
 * ofício da pessoa, nunca pela sala em que ela senta.
 */
export async function exigirChat(req: Request): Promise<Autorizado | Negado> {
  const r = await exigirSessao(req);
  if ("resposta" in r) return r;
  const { papel } = r.usuario;
  if (papel !== "ADMIN" && papel !== "COBRANCA") {
    return {
      resposta: erro("Acesso restrito à equipe de cobrança.", 403),
    };
  }
  return r;
}

/**
 * Admin ou supervisor — o portão dos RELATÓRIOS de cobrança (produção da
 * operação lida do Siscobra).
 *
 * Parece o `exigirEscopo`, e é outra coisa: ali o supervisor recebe um escopo
 * de SALAS que a rota precisa aplicar; aqui não existe recorte a aplicar, e
 * dizer que existe seria pior que não ter nenhum. Sala é divisão física do
 * inventário; equipe é `grupo` do Siscobra — os dois nunca foram ligados, e
 * inventar o vínculo agora produziria um número que ninguém sabe explicar.
 * O recorte que o gestor quer é o que ele escolhe no filtro de equipe.
 *
 * O que autoriza abrir isto ao supervisor, depois de a decisão 27 ter fechado
 * a cobrança para ele: **aqui não há devedor**. O relatório agrega produção de
 * funcionário (contagem, valor, hora, situação); não tem nome, CPF, telefone
 * nem contrato de terceiro. A porta que continua fechada é a das conversas
 * (`exigirChat`), onde o dado pessoal realmente está.
 *
 * A operadora de COBRANCA fica de fora: ela atende devedor, não avalia equipe
 * — e o relatório é um ranking nominal de colegas.
 */
export async function exigirRelatorio(req: Request): Promise<Autorizado | Negado> {
  const r = await exigirSessao(req);
  if ("resposta" in r) return r;
  const { papel } = r.usuario;
  if (papel !== "ADMIN" && papel !== "SUPERVISOR") {
    return {
      resposta: erro("Acesso restrito ao TI e aos supervisores.", 403),
    };
  }
  return r;
}

/**
 * O n8n batendo no webhook das conversas. Não é gente: não tem cookie, não tem
 * papel, não aparece na auditoria como usuário.
 *
 * Token estático em `CHAT_SERVICE_TOKEN`, comparado em tempo constante. Sem a
 * variável configurada a rota responde 503 e não 401 — "o serviço não está
 * ligado" é a verdade, e um 401 mandaria o TI procurar credencial errada
 * durante horas. É o mesmo espírito do `AUTH_SECRET` obrigatório: falta de
 * configuração se anuncia, não se disfarça de erro de permissão.
 *
 * Por que token e não sessão de usuário-robô: um `Usuario` com papel COBRANCA
 * para o n8n apareceria na fila, poderia assumir conversa e teria senha no
 * cofre. O n8n não é uma atendente — é o canal.
 */
export function exigirServico(req: Request): { resposta: ReturnType<typeof erro> } | null {
  const esperado = process.env.CHAT_SERVICE_TOKEN;
  if (!esperado) {
    return {
      resposta: erro(
        "Serviço de conversas não configurado (CHAT_SERVICE_TOKEN ausente).",
        503,
      ),
    };
  }
  const cabecalho = req.headers.get("authorization") ?? "";
  const recebido = cabecalho.startsWith("Bearer ")
    ? cabecalho.slice(7).trim()
    : "";
  if (!recebido || !igualEmTempoConstante(recebido, esperado)) {
    return { resposta: erro("Token de serviço inválido.", 401) };
  }
  return null;
}

// Comparar com `===` vazaria o tamanho e o prefixo do token pelo tempo de
// resposta. `timingSafeEqual` exige buffers do mesmo tamanho, daí a checagem
// antes — que só revela o comprimento, não o conteúdo.
function igualEmTempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
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
