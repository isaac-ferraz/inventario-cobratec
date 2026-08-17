import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { erro, tratarErroPrisma, validarCorpo } from "@/lib/api";
import { exigirChat } from "@/lib/autorizacao";
import { conversaMensagemSchema } from "@/lib/validations";
import { podeFalar } from "@/lib/conversas";
import { enviarPeloGateway } from "@/lib/chat-envio";

type Params = { params: { id: string } };

// POST /api/chat/conversas/[id]/mensagens — a operadora responde ao devedor.
//
// ORDEM IMPORTA: entrega primeiro, grava depois.
//
// O contrário (gravar e depois tentar enviar) produz o pior defeito possível
// neste domínio: a tela mostra a resposta na thread, a operadora segue em frente
// e o devedor nunca recebeu nada. Ninguém descobre até a cobrança azedar.
//
// O preço dessa ordem é o inverso — o gateway entregar e a resposta se perder no
// caminho de volta, fazendo a operadora reenviar. Mensagem repetida é
// constrangimento; mensagem fantasma é uma promessa que a empresa não sabe que
// fez. Escolhemos o constrangimento.
export async function POST(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, conversaMensagemSchema);
  if ("resposta" in r) return r.resposta;

  const conversa = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      situacao: true,
      responsavelId: true,
    },
  });
  if (!conversa) return erro("Conversa não encontrada.", 404);

  const permitido = podeFalar(
    auth.usuario.papel,
    conversa.situacao,
    conversa.responsavelId,
    auth.usuario.id,
  );
  if (!permitido.permitido) return erro(permitido.motivo, 409);

  const entrega = await enviarPeloGateway(conversa.telefone, r.data.corpo);
  if (!entrega.ok) return erro(entrega.motivo, entrega.status);

  try {
    const agora = new Date();
    const mensagem = await prisma.conversaMensagem.create({
      data: {
        conversaId: conversa.id,
        autor: "operadora",
        autorId: auth.usuario.id,
        corpo: r.data.corpo,
        waId: entrega.waId ?? null,
      },
      select: {
        id: true,
        autor: true,
        corpo: true,
        criadoEm: true,
        usuario: { select: { id: true, nome: true } },
      },
    });

    await prisma.conversa.update({
      where: { id: conversa.id },
      data: { ultimaMensagemEm: agora },
    });

    return NextResponse.json(mensagem, { status: 201 });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
