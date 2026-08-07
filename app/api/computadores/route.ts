import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computadorSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { expandirComponentes } from "@/lib/especificacoes";
import { registrarAuditoria } from "@/lib/auditoria";
import { exigirAdmin, exigirEscopo } from "@/lib/autorizacao";
import { filtroComputador } from "@/lib/supervisao";

// GET /api/computadores?funcionarioId=...&cargo=...&salaId=...
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const url = new URL(req.url);
  const funcionarioId = url.searchParams.get("funcionarioId");
  const cargo = url.searchParams.get("cargo");
  const salaId = url.searchParams.get("salaId");

  const where: Record<string, unknown> = {};
  if (funcionarioId === "sem") {
    where.funcionarioId = null;
  } else if (funcionarioId) {
    where.funcionarioId = funcionarioId;
  }
  // Filtrar por cargo só faz sentido quando há funcionário; com "sem" a
  // máquina não tem dono (nem cargo), então o filtro de cargo é ignorado.
  if (cargo && funcionarioId !== "sem") {
    where.funcionario = { cargo };
  }
  // "sem" = máquinas sem sala definida (mesma convenção do funcionário).
  if (salaId === "sem") {
    where.salaId = null;
  } else if (salaId) {
    where.salaId = salaId;
  }

  // O recorte do supervisor entra NO BANCO, e não depois: filtrar em memória
  // já teria trazido o parque inteiro para o processo.
  const escopo = filtroComputador(auth.escopo);
  const consulta = escopo ? { AND: [where, escopo] } : where;

  const computadores = await prisma.computador.findMany({
    where: consulta,
    include: {
      funcionario: true,
      sala: true,
      componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
      // Só as manutenções EM ABERTO: é o que o card precisa sinalizar.
      manutencoes: {
        where: { concluidaEm: null },
        select: { id: true, tipo: true, descricao: true, abertaEm: true },
      },
    },
    orderBy: { identificador: "asc" },
  });
  const resposta = computadores.map((c) => ({
    ...c,
    componentes: expandirComponentes(c.componentes),
  }));
  return NextResponse.json(resposta);
}

// Cadastrar máquina nova é entrada de patrimônio — segue só com o TI. O
// supervisor edita e move o que já existe na sala dele (ver PATCH em [id]).
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, computadorSchema);
  if ("resposta" in r) return r.resposta;
  try {
    const criado = await prisma.computador.create({
      data: {
        identificador: r.data.identificador,
        apelido: r.data.apelido,
        observacoes: r.data.observacoes,
        loginPadrao: r.data.loginPadrao,
        senha: r.data.senha,
        licencaWindows: r.data.licencaWindows,
        licencaMicrosoft: r.data.licencaMicrosoft,
        contaOutlook: r.data.contaOutlook,
        temMouse: r.data.temMouse,
        temTeclado: r.data.temTeclado,
        temHeadset: r.data.temHeadset,
        situacao: r.data.situacao,
        dataAquisicao: r.data.dataAquisicao,
        notaFiscal: r.data.notaFiscal,
        garantiaAte: r.data.garantiaAte,
        valorCompra: r.data.valorCompra,
        funcionarioId: r.data.funcionarioId || null,
        salaId: r.data.salaId || null,
      },
    });
    await registrarAuditoria(req, {
      acao: "criar",
      entidade: "Computador",
      entidadeId: criado.id,
      descricao: `Computador "${criado.identificador}" criado`,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
