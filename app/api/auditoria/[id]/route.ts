import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tratarErroPrisma } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";

type Params = { params: { id: string } };

// DELETE /api/auditoria/:id
// Remove um evento de auditoria manualmente. A própria remoção NÃO é registrada
// (evita um log recursivo "removeu um log"); a trilha é mantida pelo TI.
export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    await prisma.logAuditoria.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
