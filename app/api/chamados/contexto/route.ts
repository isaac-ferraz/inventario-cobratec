import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/autorizacao";

// GET /api/chamados/contexto — o que o formulário de abertura precisa saber.
//
// Devolve os equipamentos DO PRÓPRIO usuário (via funcionário vinculado) para
// ele apenas escolher "é neste computador", sem digitar patrimônio. É o único
// jeito de o operador tocar em dados de inventário: uma lista curta, só do que
// é dele, sem credencial nenhuma.
//
// Rota estática: tem precedência sobre /api/chamados/[id] no App Router.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirSessao(req);
  if ("resposta" in auth) return auth.resposta;

  if (!auth.usuario.funcionarioId) {
    // Usuário sem funcionário vinculado (ex: conta do TI) abre chamado sem
    // equipamento — não é erro.
    return NextResponse.json({ computadores: [], celulares: [], sala: null });
  }

  const funcionario = await prisma.funcionario.findUnique({
    where: { id: auth.usuario.funcionarioId },
    select: {
      sala: { select: { id: true, nome: true } },
      computadores: {
        select: { id: true, identificador: true, apelido: true },
        orderBy: { identificador: "asc" },
      },
      celulares: {
        select: { id: true, identificador: true, apelido: true, numero: true },
        orderBy: { identificador: "asc" },
      },
    },
  });

  return NextResponse.json({
    computadores: funcionario?.computadores ?? [],
    celulares: funcionario?.celulares ?? [],
    sala: funcionario?.sala ?? null,
  });
}
