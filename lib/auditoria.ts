// Trilha de auditoria. Registra as alterações feitas pela API.
//
// Princípio: o registro é BEST-EFFORT — se a gravação do log falhar, a operação
// principal NÃO é afetada (o erro é só logado no servidor). Por isso o log fica
// fora da transação da mutação.
import { prisma } from "@/lib/prisma";

export type AcaoAuditoria = "criar" | "editar" | "remover" | "mover";

type Entrada = {
  acao: AcaoAuditoria;
  entidade: "Computador" | "Componente" | "Funcionario" | "TipoComponente";
  entidadeId?: string | null;
  descricao: string;
};

// `req` é usado só para descobrir o ator (cabeçalho `x-usuario`, setado pelo
// middleware quando a auth Basic está ligada). Sem auth, o ator fica null.
export async function registrarAuditoria(
  req: Request,
  e: Entrada,
): Promise<void> {
  try {
    const ator = req.headers.get("x-usuario");
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
