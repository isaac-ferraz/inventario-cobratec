import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/autorizacao";
import { lerPaginacao, montarPagina } from "@/lib/paginacao";

// Sempre refletir o estado atual do log.
export const dynamic = "force-dynamic";

// GET /api/auditoria?entidade=Computador&pagina=1&limite=50
// Lista os eventos de auditoria, mais recentes primeiro.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const url = new URL(req.url);
  const entidade = url.searchParams.get("entidade");
  const where = entidade ? { entidade } : {};
  const p = lerPaginacao(url.searchParams);

  const [logs, total] = await Promise.all([
    prisma.logAuditoria.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: p.pular,
      take: p.limite,
    }),
    prisma.logAuditoria.count({ where }),
  ]);
  return NextResponse.json(montarPagina(logs, total, p));
}
