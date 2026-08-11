import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { erro } from "@/lib/api";
import { exigirChat } from "@/lib/autorizacao";
import { caminhoDoArquivo } from "@/lib/chat-midia";

type Params = { params: { id: string; mensagemId: string } };

// GET .../midia/[mensagemId] — o áudio ou a foto que o devedor mandou.
//
// Anexo de conversa é dado pessoal de terceiro (LGPD): passa pelo MESMO portão
// da conversa (`exigirChat`), nunca por pasta pública. Um arquivo servido de
// `/public` seria alcançável por quem tivesse o link, para sempre, sem sessão.
//
// A mensagem é buscada AMARRADA à conversa da URL: sem isso, um id de mensagem
// de outra conversa serviria pela rota de qualquer conversa.
export async function GET(req: Request, { params }: Params) {
  const auth = await exigirChat(req);
  if ("resposta" in auth) return auth.resposta;

  const mensagem = await prisma.conversaMensagem.findFirst({
    where: { id: params.mensagemId, conversaId: params.id },
    select: { midiaArquivo: true, midiaMime: true },
  });
  if (!mensagem?.midiaArquivo) return erro("Anexo não encontrado.", 404);

  const caminho = caminhoDoArquivo(mensagem.midiaArquivo);
  if (!caminho) return erro("Anexo não encontrado.", 404);

  try {
    const bytes = await readFile(caminho);
    return new NextResponse(bytes, {
      headers: {
        "content-type": mensagem.midiaMime ?? "application/octet-stream",
        // `inline` para o áudio tocar e a foto abrir na própria tela; o
        // `nosniff` global impede o navegador de reinterpretar o tipo.
        "content-disposition": "inline",
        // Anexo não muda, mas é dado pessoal: cache só no navegador de quem
        // tem a sessão, nunca em proxy.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    // Arquivo purgado ou volume trocado: a mensagem continua na thread com o
    // marcador, e a tela mostra que o anexo não está mais disponível.
    return erro("Anexo não está mais disponível no servidor.", 410);
  }
}
