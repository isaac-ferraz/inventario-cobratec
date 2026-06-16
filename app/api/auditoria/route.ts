import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Sempre refletir o estado atual do log.
export const dynamic = "force-dynamic";

// GET /api/auditoria?entidade=Computador&limite=200
// Lista os eventos de auditoria, mais recentes primeiro.
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const entidade = url.searchParams.get("entidade");
  const limite = Math.min(Number(url.searchParams.get("limite")) || 200, 500);

  const logs = await prisma.logAuditoria.findMany({
    where: entidade ? { entidade } : {},
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
  return NextResponse.json(logs);
}
