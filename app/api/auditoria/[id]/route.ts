import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tratarErroPrisma } from "@/lib/api";

type Params = { params: { id: string } };

// DELETE /api/auditoria/:id
// Remove um evento de auditoria manualmente. A própria remoção NÃO é registrada
// (evita um log recursivo "removeu um log"); a trilha é mantida pelo TI.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await prisma.logAuditoria.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
