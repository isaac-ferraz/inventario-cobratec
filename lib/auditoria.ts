// Trilha de auditoria. Registra as alterações feitas pela API.
//
// Princípio: o registro é BEST-EFFORT — se a gravação do log falhar, a operação
// principal NÃO é afetada (o erro é só logado no servidor). Por isso o log fica
// fora da transação da mutação.
import { prisma } from "@/lib/prisma";

export type AcaoAuditoria = "criar" | "editar" | "remover" | "mover";

type Entrada = {
  acao: AcaoAuditoria;
  entidade:
    | "Computador"
    | "Celular"
    | "Componente"
    | "Funcionario"
    | "TipoComponente"
    | "ItemDeposito"
    | "Sala"
    | "Usuario"
    | "Chamado"
    | "Manutencao";
  entidadeId?: string | null;
  descricao: string;
  // Ator informado pelo próprio chamador. Usado no LOGIN: naquele instante o
  // cookie ainda não existe, então o middleware não tem `x-usuario` para
  // injetar — mas sabemos exatamente quem entrou.
  atorExplicito?: string | null;
};

// `req` é usado só para descobrir o ator: o cabeçalho `x-usuario` é injetado
// pelo middleware a partir da sessão (e nunca aceito do cliente). Com login
// obrigatório, o ator está sempre preenchido — exceto no próprio login, que
// informa `atorExplicito`.
export async function registrarAuditoria(
  req: Request,
  e: Entrada,
): Promise<void> {
  try {
    const ator = e.atorExplicito ?? req.headers.get("x-usuario");
    await prisma.logAuditoria.create({
      data: {
        acao: e.acao,
        entidade: e.entidade,
        entidadeId: e.entidadeId ?? null,
        descricao: e.descricao,
        ator: ator || null,
      },
    });
  } catch (err) {
    console.error("Falha ao registrar auditoria (ignorada):", err);
  }
}
