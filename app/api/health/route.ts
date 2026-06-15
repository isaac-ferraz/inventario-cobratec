import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Nunca cachear: o health precisa refletir o estado atual.
export const dynamic = "force-dynamic";

// Health check para o Docker (e monitoramento): confirma que o app responde e
// que o banco está acessível. Fica fora da auth Basic (ver middleware.ts) para
// o healthcheck rodar sem credenciais dentro do container.
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
