// Sessão assinada em cookie — sem dependência nova.
//
// POR QUE COOKIE ASSINADO E NÃO TABELA DE SESSÃO: o `middleware.ts` do Next 14
// roda no runtime EDGE, onde o Prisma não funciona. Se a sessão vivesse só no
// banco, o middleware não teria como validá-la e o portão de rota precisaria
// existir em outro lugar. Com um cookie assinado, o middleware valida por
// criptografia (Web Crypto existe no Edge e no Node) e o lado servidor ainda
// confere no banco se o usuário continua ativo — ver lib/sessao-servidor.ts.
//
// Formato: "<payload-base64url>.<assinatura-base64url>", HMAC-SHA256.
export type Sessao = {
  uid: string;
  login: string;
  papel: "ADMIN" | "OPERADOR";
  exp: number; // epoch em segundos
};

export const COOKIE_SESSAO = "sessao";
export const DURACAO_SESSAO_S = 12 * 60 * 60; // 12h — uma jornada de trabalho

// O app NÃO sobe sem segredo: falhar aqui é melhor do que assinar sessão com
// um valor padrão previsível, que qualquer um poderia forjar.
export function segredo(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET ausente ou curto demais (mínimo 16 caracteres). Defina-o no .env — veja .env.example.",
    );
  }
  return s;
}

// As funções abaixo devolvem Uint8Array com ArrayBuffer concreto (e não
// ArrayBufferLike): é o que a Web Crypto aceita como BufferSource.
function texto(t: string): Uint8Array<ArrayBuffer> {
  const utf8 = new TextEncoder().encode(t);
  const copia = new Uint8Array(new ArrayBuffer(utf8.byteLength));
  copia.set(utf8);
  return copia;
}

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(t: string): Uint8Array<ArrayBuffer> {
  const b64 = t.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    texto(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function assinarSessao(
  dados: Omit<Sessao, "exp">,
  duracaoS = DURACAO_SESSAO_S,
  agoraS = Math.floor(Date.now() / 1000),
): Promise<string> {
  const sessao: Sessao = { ...dados, exp: agoraS + duracaoS };
  const payload = base64urlEncode(
    texto(JSON.stringify(sessao)),
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    await chaveHmac(),
    texto(payload),
  );
  return `${payload}.${base64urlEncode(new Uint8Array(assinatura))}`;
}

// Devolve a sessão só se a assinatura confere E não expirou. Qualquer defeito
// (formato, assinatura, validade) resulta em null — nunca em exceção, para o
// middleware poder tratar tudo como "não autenticado".
export async function lerSessao(
  token: string | undefined | null,
  agoraS = Math.floor(Date.now() / 1000),
): Promise<Sessao | null> {
  if (!token) return null;
  const ponto = token.indexOf(".");
  if (ponto <= 0) return null;

  const payload = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);

  try {
    const valida = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      base64urlDecode(assinatura),
      texto(payload),
    );
    if (!valida) return null;

    const sessao = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payload)),
    ) as Sessao;

    if (
      typeof sessao?.uid !== "string" ||
      typeof sessao?.login !== "string" ||
      (sessao?.papel !== "ADMIN" && sessao?.papel !== "OPERADOR") ||
      typeof sessao?.exp !== "number"
    ) {
      return null;
    }
    if (sessao.exp <= agoraS) return null;

    return sessao;
  } catch {
    return null;
  }
}

export function ehAdmin(sessao: Sessao | null): boolean {
  return sessao?.papel === "ADMIN";
}
