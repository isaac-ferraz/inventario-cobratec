// Anexos que o devedor manda (áudio, foto, comprovante).
//
// O gateway guarda o arquivo por pouco tempo e o serve por uma URL própria. Se
// a operadora só tivesse essa URL, o áudio sumiria da thread quando o gateway
// reciclasse o arquivo — e o histórico de um atendimento de cobrança precisa
// durar mais que o cache de um container. Então baixamos uma vez e guardamos.
//
// FORA DO BANCO, ao lado do dev.db (mesmo volume). SQLite com blob de áudio
// vira um arquivo de gigabytes que o backup copia inteiro toda noite; e o dado
// que importa aqui é a CONVERSA — o anexo é acessório e pode ser purgado sem
// perder o que foi dito.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Onde os anexos ficam. No container é `/app/data/chat-midia` — dentro do
 * volume, junto do banco, para o backup e a restauração serem uma coisa só.
 */
export function pastaDeMidia(): string {
  return (
    process.env.CHAT_MIDIA_DIR?.trim() ||
    path.join(process.cwd(), "data", "chat-midia")
  );
}

// Áudio de WhatsApp raramente passa de 1MB; vídeo passa fácil. O teto existe
// para um envio grande não encher o disco do escritório — acima dele a mensagem
// continua na fila com o marcador, só sem o arquivo.
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const EXTENSAO: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export function extensaoDe(mime: string | null): string {
  if (!mime) return "bin";
  const limpo = mime.split(";")[0].trim().toLowerCase();
  return EXTENSAO[limpo] ?? "bin";
}

/**
 * Nome do arquivo no disco.
 *
 * Deriva do id da mensagem (hash), e não do nome que veio do WhatsApp: nome de
 * arquivo de terceiro é entrada não confiável — "../../dev.db" gravaria fora da
 * pasta. Aqui não há caractere que o remetente controle.
 */
export function nomeDeArquivo(mensagemId: string, mime: string | null): string {
  const hash = createHash("sha1").update(mensagemId).digest("hex").slice(0, 24);
  return `${hash}.${extensaoDe(mime)}`;
}

export type MidiaSalva = { arquivo: string; bytes: number; mime: string | null };

/**
 * Baixa o anexo do gateway e grava na pasta. Devolve `null` em qualquer
 * problema — e isso é de propósito: **falha de anexo nunca derruba a mensagem**.
 * A fala do devedor já está gravada quando esta função roda; o pior caso é a
 * operadora ver "[áudio]" sem poder ouvir, e não a conversa desaparecer.
 */
export async function baixarMidia(
  url: string,
  apiKey: string | null,
  mensagemId: string,
  mimeConhecido: string | null,
): Promise<MidiaSalva | null> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
      signal: controle.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    // Confere o tamanho ANTES de ler o corpo quando o gateway o anuncia; e de
    // novo depois, porque o cabeçalho pode mentir ou faltar.
    const anunciado = Number(res.headers.get("content-length") ?? "0");
    if (anunciado > MAX_BYTES) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;

    const mime = mimeConhecido ?? res.headers.get("content-type");
    const arquivo = nomeDeArquivo(mensagemId, mime);
    const pasta = pastaDeMidia();
    await mkdir(pasta, { recursive: true });
    await writeFile(path.join(pasta, arquivo), bytes);

    return { arquivo, bytes: bytes.length, mime };
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Caminho absoluto de um anexo já gravado, para a rota que o serve.
 *
 * A checagem contra travessia é dupla de propósito: o valor vem do banco (não
 * do usuário), mas uma rota que serve arquivo por nome é o lugar clássico de
 * `../../` — e o custo de conferir é zero.
 */
export function caminhoDoArquivo(arquivo: string): string | null {
  if (!arquivo || arquivo.includes("/") || arquivo.includes("\\")) return null;
  if (arquivo.includes("..")) return null;
  return path.join(pastaDeMidia(), arquivo);
}
