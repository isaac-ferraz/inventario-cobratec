import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { componenteSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { serializar, expandirComponente } from "@/lib/especificacoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin } from "@/lib/autorizacao";

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, componenteSchema);
  if ("resposta" in r) return r.resposta;
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
