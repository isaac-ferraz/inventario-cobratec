import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { funcionarioSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma, erro } from "@/lib/api";
import { registrarAuditoria } from "@/lib/auditoria";
import { moverParaSala, rotuloDestino } from "@/lib/mover-sala";
import { exigirAdmin, exigirEscopo, foraDoEscopo } from "@/lib/autorizacao";
import { alcancaFuncionario, podeMover } from "@/lib/supervisao";

type Params = { params: { id: string } };

// GET /api/funcionarios/[id] — o perfil: a pessoa e tudo que está na mão dela.
//
// Junta numa chamada só o que antes exigia caçar em três telas: computadores
// com o hardware, celulares, sala e os chamados que ela abriu.
export async function GET(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;

  const funcionario = await prisma.funcionario.findUnique({
    where: { id: params.id },
    include: {
      sala: true,
      computadores: {
        orderBy: { identificador: "asc" },
        include: {
          sala: true,
          componentes: { include: { tipo: true }, orderBy: { criadoEm: "asc" } },
        },
      },
      celulares: { orderBy: { identificador: "asc" } },
      // Só os usuários ligados a esta pessoa — sem hash de senha, que não tem
      // por que sair do banco.
      usuarios: {
        select: { id: true, login: true, papel: true, ativo: true },
      },
    },
  });
  if (!funcionario) return erro("Funcionário não encontrado.", 404);
  // O perfil carrega o cofre de credenciais: fora do escopo, nem existe.
  if (!alcancaFuncionario(auth.escopo, funcionario)) {
    return foraDoEscopo("Funcionário");
  }

  // Chamados abertos por qualquer conta vinculada a este funcionário.
  const idsUsuario = funcionario.usuarios.map((u) => u.id);
  const chamados = idsUsuario.length
    ? await prisma.chamado.findMany({
        where: { solicitanteId: { in: idsUsuario } },
        orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
        take: 10,
        select: {
          id: true,
          numero: true,
          titulo: true,
          status: true,
          prioridade: true,
          criadoEm: true,
        },
      })
    : [];

  return NextResponse.json({ ...funcionario, chamados });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirEscopo(req);
  if ("resposta" in auth) return auth.resposta;
  const r = await validarCorpo(req, funcionarioSchema.partial());
  if ("resposta" in r) return r.resposta;

  // A sala sai do update comum: mudar a sala do funcionário é uma MUDANÇA DE
  // SALA, não uma edição de cadastro — leva os computadores dele junto e é
  // registrada como "mover". Ver lib/mover-sala.ts.
  const { salaId, ...campos } = r.data;
  const mudaSala = "salaId" in r.data;

  // Escopo antes de escrever: a pessoa precisa sentar numa sala dele.
  const antesDoEscopo = await prisma.funcionario.findUnique({
    where: { id: params.id },
    select: { salaId: true },
  });
  if (!antesDoEscopo) return erro("Registro não encontrado.", 404);
  if (!alcancaFuncionario(auth.escopo, antesDoEscopo)) {
    return foraDoEscopo("Funcionário");
  }

  try {
    if (mudaSala) {
      const atual = antesDoEscopo;

      const destinoSalaId = salaId ?? null;
      if (atual.salaId !== destinoSalaId) {
        // Mudar a pessoa de sala leva os equipamentos dela junto — por isso o
        // destino também precisa ser do supervisor, senão a equipe inteira
        // sairia do alcance dele de uma vez.
        if (!podeMover(auth.escopo, atual.salaId, destinoSalaId)) {
          return erro(
            "Você só pode mover pessoas entre as salas pelas quais responde.",
            403,
          );
        }
        const destinoNome = await rotuloDestino(destinoSalaId);
        if (!destinoNome) return erro("Sala de destino não encontrada.", 404);

        const resultado = await moverParaSala({
          destinoSalaId,
          destinoNome,
          funcionarioIds: [params.id],
        });
        for (const e of resultado.eventos) {
          await registrarAuditoria(req, {
            acao: "mover",
            entidade: e.entidade,
            entidadeId: e.id,
            descricao: e.descricao,
          });
        }
      }
    }

    // Os demais campos seguem como edição normal.
    const atualizado = await prisma.funcionario.update({
      where: { id: params.id },
      data: campos,
    });
    if (Object.keys(campos).length > 0) {
      await registrarAuditoria(req, {
        acao: "editar",
        entidade: "Funcionario",
        entidadeId: atualizado.id,
        descricao: `Funcionário "${atualizado.nome}" editado${
          r.data.ativo === false ? " (inativado)" : ""
        }`,
      });
    }
    return NextResponse.json(atualizado);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// DELETE: por padrão bloqueia se houver computador ou celular vinculado. Use
// ?liberar=1 para soltar os aparelhos (funcionarioId = null) antes de remover.
export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  const url = new URL(req.url);
  const liberar = url.searchParams.get("liberar") === "1";

  const [computadores, celulares] = await Promise.all([
    prisma.computador.count({ where: { funcionarioId: params.id } }),
    prisma.celular.count({ where: { funcionarioId: params.id } }),
  ]);
  const vinculados = computadores + celulares;

  if (vinculados > 0 && !liberar) {
    return erro(
      `Funcionário possui ${computadores} computador(es) e ${celulares} celular(es). Confirme a liberação para "sem funcionário" antes de remover.`,
      409,
    );
  }

  try {
    // Liberar os aparelhos e remover o funcionário de forma atômica (evita
    // estado intermediário se algo falhar entre os passos).
    const removido = await prisma.$transaction(async (tx) => {
      if (vinculados > 0 && liberar) {
        await tx.computador.updateMany({
          where: { funcionarioId: params.id },
          data: { funcionarioId: null },
        });
        await tx.celular.updateMany({
          where: { funcionarioId: params.id },
          data: { funcionarioId: null },
        });
      }
      return tx.funcionario.delete({ where: { id: params.id } });
    });
    await registrarAuditoria(req, {
      acao: "remover",
      entidade: "Funcionario",
      entidadeId: removido.id,
      descricao: `Funcionário "${removido.nome}" removido${
        vinculados > 0
          ? ` (${computadores} computador(es) e ${celulares} celular(es) liberado(s))`
          : ""
      }`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
