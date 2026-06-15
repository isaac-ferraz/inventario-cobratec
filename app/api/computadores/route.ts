import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computadorSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { expandirComponentes } from "@/lib/especificacoes";

// GET /api/computadores?funcionarioId=...&cargo=...
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const funcionarioId = url.searchParams.get("funcionarioId");
  const cargo = url.searchParams.get("cargo");

  const where: Record<string, unknown> = {};
  if (funcionarioId === "sem") {
    where.funcionarioId = null;
  } else if (funcionarioId) {
    where.funcionarioId = funcionarioId;
  }
  if (cargo) {
    where.funcionario = { cargo };
  }

  const computadores = await prisma.computador.findMany({
    where,
    include: {
      funcionario: true,
      componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
    },
    orderBy: { identificador: "asc" },
  });
  const resposta = computadores.map((c) => ({
    ...c,
    componentes: expandirComponentes(c.componentes),
  }));
  return NextResponse.json(resposta);
}

export async function POST(req: Request): Promise<NextResponse> {
  const r = await validarCorpo(req, computadorSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.computador.create({
      data: {
        identificador: r.data.identificador,
        apelido: r.data.apelido,
        observacoes: r.data.observacoes,
        loginPadrao: r.data.loginPadrao,
        licencaWindows: r.data.licencaWindows,
        licencaMicrosoft: r.data.licencaMicrosoft,
        contaOutlook: r.data.contaOutlook,
        temMouse: r.data.temMouse,
        temTeclado: r.data.temTeclado,
        temHeadset: r.data.temHeadset,
        funcionarioId: r.data.funcionarioId || null,
      },
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
