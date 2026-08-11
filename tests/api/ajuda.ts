// Ferramentas comuns dos testes de API: semear usuários, forjar a requisição
// com o cookie de sessão assinado e limpar o banco entre arquivos.
import { prisma } from "@/lib/prisma";
import { gerarHashSenha } from "@/lib/senha";
import { assinarSessao, COOKIE_SESSAO } from "@/lib/sessao";

export type { Papel } from "@/lib/supervisao";
import type { Papel } from "@/lib/supervisao";

export type UsuarioTeste = {
  id: string;
  login: string;
  papel: Papel;
};

// Ordem importa: filho antes do pai, senão a FK barra.
export async function limparBanco(): Promise<void> {
  await prisma.supervisorSala.deleteMany();
  await prisma.conversaMensagem.deleteMany();
  await prisma.conversa.deleteMany();
  await prisma.chamadoMensagem.deleteMany();
  await prisma.chamado.deleteMany();
  await prisma.manutencao.deleteMany();
  await prisma.componente.deleteMany();
  await prisma.computador.deleteMany();
  await prisma.celular.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.funcionario.deleteMany();
  await prisma.tipoComponente.deleteMany();
  await prisma.itemDeposito.deleteMany();
  await prisma.sala.deleteMany();
  await prisma.logAuditoria.deleteMany();
}

export async function criarUsuario(
  login: string,
  papel: Papel,
  ativo = true,
): Promise<UsuarioTeste> {
  const u = await prisma.usuario.create({
    data: {
      login,
      nome: login,
      senhaHash: await gerarHashSenha("senha-de-teste-123"),
      papel,
      ativo,
    },
    select: { id: true, login: true, papel: true },
  });
  return { id: u.id, login: u.login, papel: u.papel as Papel };
}

/** Cookie de sessão válido para o usuário — é o que as rotas leem do Request. */
export async function cookieDe(u: UsuarioTeste): Promise<string> {
  const token = await assinarSessao({
    uid: u.id,
    login: u.login,
    papel: u.papel,
  });
  return `${COOKIE_SESSAO}=${token}`;
}

type Opcoes = {
  usuario?: UsuarioTeste;
  corpo?: unknown;
  /** Cookie cru — para os casos de token inválido/expirado. */
  cookie?: string;
};

/** Monta um Request como o Next entregaria ao route handler. */
export async function requisicao(
  metodo: string,
  url: string,
  opcoes: Opcoes = {},
): Promise<Request> {
  const cabecalhos: Record<string, string> = {
    "content-type": "application/json",
  };
  const cookie =
    opcoes.cookie ?? (opcoes.usuario ? await cookieDe(opcoes.usuario) : null);
  if (cookie) cabecalhos.cookie = cookie;

  return new Request(`http://localhost${url}`, {
    method: metodo,
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
}

/** Status + corpo já em JSON, que é o que quase todo teste quer conferir. */
export async function ler(res: Response): Promise<{
  status: number;
  corpo: Record<string, unknown> & { [k: string]: unknown };
}> {
  const texto = await res.text();
  return {
    status: res.status,
    corpo: texto ? JSON.parse(texto) : {},
  };
}
