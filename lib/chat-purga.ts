// Apagar conversa — o caminho único.
//
// Isto era o corpo do `DELETE /api/chat/conversas/[id]` e saiu de lá quando a
// purga agendada entrou. Não por gosto por camadas: apagar conversa envolve uma
// cascata no banco MAIS arquivos no disco, e duas implementações disso
// divergiriam na segunda vez que alguém mexesse numa delas — a que roda de
// madrugada, sem ninguém olhando, é a que ficaria para trás.
//
// A regra do apagamento continua a da decisão 33: some a conversa INTEIRA, com
// a memória do robô junto (`siscobraDevcod`, `documentoPendente`, `saldo`,
// `oferta`, `dossie` são colunas da própria `Conversa`). Apagar só as mensagens
// deixaria a tela limpa e o robô sabendo de tudo.
import { readdir, unlink } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { caminhoDoArquivo, pastaDeMidia } from "@/lib/chat-midia";
import { limiteAuditoria, limiteConversas, type ContagemPurga } from "@/lib/retencao";

/**
 * Apaga os arquivos de anexo. Devolve quantos sumiram de fato.
 *
 * Arquivo que já não existe conta como sucesso: o download pode ter fracassado
 * lá atrás sem derrubar a fala (decisão 30), e nesse caso a linha no banco
 * aponta para um arquivo que nunca chegou a existir.
 */
async function apagarArquivos(nomes: string[]): Promise<number> {
  let removidos = 0;
  for (const nome of nomes) {
    const caminho = caminhoDoArquivo(nome);
    if (!caminho) continue;
    try {
      await unlink(caminho);
      removidos++;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") removidos++;
      else console.warn(`[chat] anexo não apagado: ${nome}`);
    }
  }
  return removidos;
}

export type ResultadoApagar =
  | { ok: false }
  | { ok: true; telefone: string; anexos: number; anexosRemovidos: number };

/** Apaga uma conversa pelo id. Usado pela rota manual e pela purga agendada. */
export async function apagarConversa(id: string): Promise<ResultadoApagar> {
  const conversa = await prisma.conversa.findUnique({
    where: { id },
    select: { id: true, telefone: true, mensagens: { select: { midiaArquivo: true } } },
  });
  if (!conversa) return { ok: false };

  // Os nomes dos anexos são lidos ANTES do delete. Depois da cascata não sobra
  // linha apontando para o arquivo, e anexo órfão é áudio ou foto de devedor
  // parado no disco sem nada que leve até ele — ninguém acharia para apagar.
  const arquivos = conversa.mensagens
    .map((m) => m.midiaArquivo)
    .filter((a): a is string => Boolean(a));

  // Banco primeiro, disco depois: enquanto a linha existe o anexo continua
  // sendo servido pela rota de mídia, então derrubar a linha é o que de fato
  // tira o arquivo do alcance.
  await prisma.conversa.delete({ where: { id: conversa.id } });
  const removidos = await apagarArquivos(arquivos);

  return {
    ok: true,
    telefone: conversa.telefone,
    anexos: arquivos.length,
    anexosRemovidos: removidos,
  };
}

/**
 * As conversas encerradas fora da janela de retenção.
 *
 * Só `encerrada`: conversa em `bot`, `fila` ou `humana` é atendimento vivo, por
 * mais antiga que seja. Uma conversa parada há um ano na fila é um problema de
 * operação — apagá-la resolveria o sintoma e apagaria a evidência.
 */
export async function purgarConversas(
  agora: Date,
  dias: number,
  seco: boolean,
): Promise<Pick<ContagemPurga, "conversas" | "mensagens" | "anexos">> {
  const limite = limiteConversas(agora, dias);
  const alvos = await prisma.conversa.findMany({
    where: { situacao: "encerrada", encerradaEm: { not: null, lt: limite } },
    select: { id: true, _count: { select: { mensagens: true } } },
  });
  if (alvos.length === 0) return { conversas: 0, mensagens: 0, anexos: 0 };

  const mensagens = alvos.reduce((s, c) => s + c._count.mensagens, 0);
  const anexos = await prisma.conversaMensagem.count({
    where: { conversaId: { in: alvos.map((a) => a.id) }, midiaArquivo: { not: null } },
  });

  if (seco) return { conversas: alvos.length, mensagens, anexos };

  let apagadas = 0;
  let anexosRemovidos = 0;
  for (const alvo of alvos) {
    // Uma a uma, e não um `deleteMany`: o `deleteMany` levaria as linhas e
    // deixaria todo arquivo de áudio no disco, sem nada que leve até ele.
    const r = await apagarConversa(alvo.id);
    if (r.ok) {
      apagadas++;
      anexosRemovidos += r.anexosRemovidos;
    }
  }
  return { conversas: apagadas, mensagens, anexos: anexosRemovidos };
}

/**
 * Arquivos na pasta de mídia sem nenhuma mensagem apontando para eles.
 *
 * Eles aparecem: um `deleteMany` antigo, um restore de backup do banco sem o
 * disco, um download concluído logo depois de a conversa ser apagada. Áudio de
 * devedor parado no volume, sem trilha e sem dono, é o pior tipo de dado
 * pessoal — ninguém sabe que ele está lá.
 */
export async function purgarOrfaos(seco: boolean): Promise<number> {
  let arquivos: string[];
  try {
    arquivos = await readdir(pastaDeMidia());
  } catch {
    // Pasta inexistente é o caso normal de quem nunca recebeu anexo.
    return 0;
  }
  if (arquivos.length === 0) return 0;

  const conhecidos = new Set(
    (
      await prisma.conversaMensagem.findMany({
        where: { midiaArquivo: { not: null } },
        select: { midiaArquivo: true },
      })
    )
      .map((m) => m.midiaArquivo)
      .filter((a): a is string => Boolean(a)),
  );

  const orfaos = arquivos.filter((a) => !conhecidos.has(a));
  if (seco || orfaos.length === 0) return orfaos.length;
  return apagarArquivos(orfaos);
}

/**
 * Eventos de auditoria fora da janela.
 *
 * A trilha é append-only por decisão, e continua sendo: o que a purga faz é
 * definir por quanto tempo ela vale, que é coisa diferente de deixar alguém
 * editá-la. Dois anos cobre a pergunta que aparece meses depois ("quem mexeu
 * nisso?") sem transformar o log num arquivo que cresce para sempre.
 */
export async function purgarAuditoria(
  agora: Date,
  dias: number,
  seco: boolean,
): Promise<number> {
  const where = { criadoEm: { lt: limiteAuditoria(agora, dias) } };
  if (seco) return prisma.logAuditoria.count({ where });
  const r = await prisma.logAuditoria.deleteMany({ where });
  return r.count;
}
