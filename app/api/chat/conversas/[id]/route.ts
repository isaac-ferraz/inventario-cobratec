import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { erro, tratarErroPrisma, validarCorpo } from "@/lib/api";
import { exigirAdmin, exigirChat } from "@/lib/autorizacao";
import { conversaSituacaoSchema } from "@/lib/validations";
import { podeMudarSituacao } from "@/lib/conversas";
import { caminhoDoArquivo } from "@/lib/chat-midia";
import { registrarAuditoria } from "@/lib/auditoria";

type Params = { params: { id: string } };

// GET /api/chat/conversas/[id] — a conversa inteira + o dossiê do Siscobra.
export async function GET(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const conversa = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      nome: true,
      carteira: true,
      situacao: true,
      motivoEscalonamento: true,
      siscobraDevcod: true,
      siscobraCarcod: true,
      identificadaEm: true,
      dossie: true,
      oferta: true,
      dossieEm: true,
      criadoEm: true,
      ultimaMensagemEm: true,
      encerradaEm: true,
      responsavel: { select: { id: true, nome: true, login: true } },
      mensagens: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true,
          autor: true,
          corpo: true,
          criadoEm: true,
          // O anexo em si sai pela rota `/midia/[mensagemId]`; aqui vai só o
          // suficiente para a tela decidir se desenha player, miniatura ou nada.
          midiaTipo: true,
          midiaMime: true,
          midiaArquivo: true,
          usuario: { select: { id: true, nome: true } },
        },
      },
    },
  });
  if (!conversa) return erro("Conversa não encontrada.", 404);

  // O dossiê é guardado como JSON em texto (SQLite não tem Json no Prisma) e
  // volta como objeto para a tela. JSON quebrado não derruba a conversa: o
  // atendimento continua sem o dossiê, que é o menos importante dos dois.
  let dossie: unknown = null;
  if (conversa.dossie) {
    try {
      dossie = JSON.parse(conversa.dossie);
    } catch {
      dossie = null;
    }
  }

  return NextResponse.json({ ...conversa, dossie });
}

// PATCH /api/chat/conversas/[id] — assumir, devolver para a fila ou encerrar.
//
// Uma rota só para as três porque são a mesma coisa: mudar a situação. As
// transições permitidas vivem em `podeMudarSituacao` (lib/conversas.ts).
export async function PATCH(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, conversaSituacaoSchema);
  if ("resposta" in r) return r.resposta;

  const atual = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      situacao: true,
      responsavelId: true,
      responsavel: { select: { nome: true } },
    },
  });
  if (!atual) return erro("Conversa não encontrada.", 404);

  const nova = r.data.situacao;
  const permitido = podeMudarSituacao(atual.situacao, nova);
  if (!permitido.permitido) return erro(permitido.motivo, 409);

  // Tomar conversa que já está com outra atendente é conflito de atendimento,
  // não falta de permissão: o admin resolve, a colega pede. Ficar calado aqui
  // faria duas pessoas responderem o mesmo devedor.
  if (
    nova === "humana" &&
    atual.situacao === "humana" &&
    atual.responsavelId !== auth.usuario.id &&
    auth.usuario.papel !== "ADMIN"
  ) {
    return erro(
      `Esta conversa já está com ${atual.responsavel?.nome ?? "outra atendente"}.`,
      409,
    );
  }

  const agora = new Date();
  try {
    const atualizada = await prisma.$transaction(async (tx) => {
      const c = await tx.conversa.update({
        where: { id: atual.id },
        data: {
          situacao: nova,
          // Assumir prende a conversa a quem assumiu; devolver e encerrar
          // soltam, para a próxima pessoa não herdar um dono que saiu.
          responsavelId: nova === "humana" ? auth.usuario.id : null,
          encerradaEm: nova === "encerrada" ? agora : null,
        },
        select: { id: true, situacao: true, responsavelId: true },
      });

      // O marco entra na própria thread, como no helpdesk: quem abrir a
      // conversa depois entende por que o tom mudou no meio.
      await tx.conversaMensagem.create({
        data: {
          conversaId: atual.id,
          autor: "sistema",
          autorId: auth.usuario.id,
          corpo:
            nova === "humana"
              ? `${auth.usuario.nome} assumiu o atendimento.`
              : nova === "fila"
                ? `${auth.usuario.nome} devolveu a conversa para a fila.`
                : `${auth.usuario.nome} encerrou o atendimento.`,
        },
      });
      return c;
    });

    // Auditoria: quem assumiu e quem encerrou uma cobrança é exatamente o tipo
    // de pergunta que aparece meses depois. A mensagem trocada, não — a thread
    // já é o histórico dela (mesma escolha do chamado, decisão 20).
    await registrarAuditoria(req, {
      acao: "editar",
      entidade: "Conversa",
      entidadeId: atual.id,
      descricao: `Conversa com ${atual.telefone}: ${atual.situacao} → ${nova}`,
    });

    return NextResponse.json(atualizada);
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

// DELETE /api/chat/conversas/[id] — apaga a conversa inteira.
//
// **Por que a conversa e não a mensagem.** `ConversaMensagem` é append-only por
// decisão ("mensagem enviada ao devedor não se edita nem se apaga — é registro
// de cobrança"), e nada aqui afrouxa isso: o que some não é uma fala escolhida a
// dedo, é o registro inteiro. Apagar mensagem avulsa deixaria um histórico
// adulterado, que é pior que histórico nenhum — parece íntegro. Uma cobrança ou
// existe como prova inteira, ou não existe.
//
// **E é o que resolve o problema que a pediu.** Ela nasceu do teste: um número
// só, usado muitas vezes, e o robô lembrando o CPF da rodada anterior. Essa
// lembrança NÃO está nas mensagens — mora em `siscobraDevcod`, `identificadaEm`,
// `cpfPendente`, `nascimentoPendente`, `saldo`, `oferta` e `dossie`, todos
// campos da própria `Conversa` (decisão 32, a memória entre um turno e o
// seguinte). Apagar só as mensagens deixaria a tela limpa e o robô sabendo de
// tudo — o pior dos dois mundos. Some a linha, some a memória.
//
// **Só ADMIN**, e não `exigirChat` como as rotas vizinhas: quem atende não apaga
// o registro do que disse ao devedor. Poder apagar é decisão do TI.
export async function DELETE(req: Request, { params }: Params) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const conversa = await prisma.conversa.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      telefone: true,
      mensagens: { select: { midiaArquivo: true } },
    },
  });
  if (!conversa) return erro("Conversa não encontrada.", 404);

  // Os nomes dos anexos são lidos ANTES do delete. Depois da cascata não sobra
  // linha apontando para o arquivo, e anexo órfão é áudio ou foto de devedor
  // parado no disco (decisão 30: o arquivo mora fora do banco) sem nada que
  // leve até ele — ninguém acharia para apagar depois.
  const arquivos = conversa.mensagens
    .map((m) => m.midiaArquivo)
    .filter((a): a is string => Boolean(a));

  try {
    // Cascata leva as mensagens junto (onDelete: Cascade no schema).
    await prisma.conversa.delete({ where: { id: conversa.id } });
  } catch (e) {
    return tratarErroPrisma(e);
  }

  // Banco primeiro, disco depois: enquanto a linha existe o anexo continua
  // sendo servido pela rota de mídia, então derrubar a linha é o que de fato
  // tira o arquivo do alcance. Falhar aqui não desfaz o apagamento — vira ruído
  // no log, que é o pior caso aceitável.
  let sobraram = 0;
  for (const arquivo of arquivos) {
    const caminho = caminhoDoArquivo(arquivo);
    if (!caminho) continue;
    try {
      await unlink(caminho);
    } catch (e) {
      // Arquivo que já não existe é sucesso, não falha: o download pode ter
      // fracassado lá atrás sem derrubar a fala (decisão 30).
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        sobraram++;
        console.warn(`[chat] anexo não apagado: ${arquivo}`);
      }
    }
  }

  // A trilha é o que torna aceitável poder apagar: some a conversa, fica quem
  // mandou sumir. Telefone entra (mesma escolha do PATCH acima); CPF, saldo e
  // corpo de mensagem, nunca — a auditoria não é lugar de dado de devedor.
  await registrarAuditoria(req, {
    acao: "remover",
    entidade: "Conversa",
    entidadeId: conversa.id,
    descricao:
      `Conversa com ${conversa.telefone} apagada` +
      (arquivos.length ? ` (${arquivos.length} anexo(s))` : ""),
  });

  return NextResponse.json({ ok: true, anexosRemovidos: arquivos.length - sobraram });
}
