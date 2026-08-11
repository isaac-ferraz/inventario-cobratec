import { NextResponse } from "next/server";
import { conversaWebhookSchema } from "@/lib/validations";
import { validarCorpo, tratarErroPrisma } from "@/lib/api";
import { exigirServico } from "@/lib/autorizacao";
import { normalizarTelefone } from "@/lib/conversas";
import { registrarEntrada } from "@/lib/chat-registro";
import { publicar } from "@/lib/chat-eventos";

// POST /api/chat/webhook — o n8n entrega uma mensagem que passou pelo WhatsApp.
//
// Esta é uma das duas rotas do sistema que não são usadas por gente (ver
// `exigirServico`); a outra é `/api/chat/waha/webhook`, do modo direto. O
// contrato é deliberadamente burro: o n8n manda o que aconteceu, e aqui só se
// grava. Nenhuma decisão de atendimento mora nesta rota — quem decide responder
// ou escalar é o fluxo do n8n, que tem o LLM e a consulta ao Siscobra.
//
// O que a rota DE FATO garante, e que o n8n não pode garantir sozinho, está em
// `registrarEntrada` (lib/chat-registro.ts): idempotência da reentrega,
// conversa criada sem corrida, encerrada que reabre e robô que não rouba de
// volta o que já está com gente.
export async function POST(req: Request): Promise<NextResponse> {
  const negado = exigirServico(req);
  if (negado) return negado.resposta;

  const r = await validarCorpo(req, conversaWebhookSchema);
  if ("resposta" in r) return r.resposta;
  const d = r.data;

  const telefone = normalizarTelefone(d.telefone);
  if (!telefone) {
    return NextResponse.json({ erro: "Telefone inválido." }, { status: 400 });
  }

  try {
    const registro = await registrarEntrada({ ...d, telefone });

    // Acende a fila das telas abertas. Vale para os dois caminhos: aqui é o
    // robô conversando, e a operadora precisa ver a conversa andar sem esperar
    // a próxima consulta.
    if (!registro.duplicada) {
      publicar({ tipo: "mensagem", conversaId: registro.conversaId });
    }

    // A resposta diz a situação para o n8n saber se ainda é ele quem conduz:
    // "humana" significa que uma operadora assumiu e o robô deve calar.
    return NextResponse.json({
      ok: true,
      conversaId: registro.conversaId,
      situacao: registro.situacao,
      ...(registro.duplicada ? { duplicada: true } : {}),
    });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}
