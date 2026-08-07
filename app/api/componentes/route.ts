import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { componenteSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { serializar, expandirComponente } from "@/lib/especificacoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirEscopo, foraDoEscopo } from "@/lib/autorizacao";
import { alcancaComputador } from "@/lib/supervisao";

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, componenteSchema);
  if ("resposta" in r) return r.resposta;

  // Escopo pela máquina de destino: sem isto, bastaria mandar o id de um
  // computador de outra sala no corpo.
  const pc = await prisma.computador.findUnique({
    where: { id: r.data.computadorId },
    select: { salaId: true, funcionario: { select: { salaId: true } } },
  });
  if (!pc) return foraDoEscopo("Computador");
  if (!alcancaComputador(auth.escopo, pc)) return foraDoEscopo("Computador");

  try {
    const criado = await prisma.componente.create({
      data: {
        computadorId: r.data.computadorId,
        tipoId: r.data.tipoId,
        descricao: r.data.descricao,
        especificacoes: serializar(r.data.especificacoes),
      },
      include: { tipo: true },
    });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Componente",
      entidadeId: criado.id,
      descricao: `Componente "${criado.tipo.nome}: ${criado.descricao}" adicionado`,
    });
    return NextResponse.json(expandirComponente(criado), { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
