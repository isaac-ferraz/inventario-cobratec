// Hash de senha de LOGIN — sem dependência nova, usando o `crypto` do Node.
//
// Por que scrypt e não bcrypt/argon2: os dois exigiriam uma dependência nativa
// (compilação no build do Docker Alpine). O scrypt vem no Node, é uma KDF
// deliberadamente cara (resiste a força bruta) e o custo é configurável.
//
// IMPORTANTE — distinção do projeto: as senhas do COFRE (Siscobra, Vonix, senha
// do PC) continuam em texto puro, porque o propósito delas é ser LIDA de volta
// pelo TI (decisão 8). A senha de login é o oposto: nunca precisa ser lida, só
// comparada — então é guardada como hash e não há como recuperá-la, apenas
// redefinir.
//
// Formato guardado: "scrypt$<N>$<salt-hex>$<hash-hex>". Guardar o custo junto
// permite aumentá-lo no futuro sem invalidar os hashes antigos.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

// Promise manual em vez de promisify: os overloads do scrypt com `options` não
// sobrevivem ao promisify e a tipagem se perde.
function scryptAsync(
  senha: string,
  salt: Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, tamanho, opcoes, (err, chave) =>
      err ? reject(err) : resolve(chave),
    );
  });
}

const CUSTO_PADRAO = 16384; // N do scrypt (2^14) — ~100ms por hash
const TAMANHO_CHAVE = 64;
const TAMANHO_SALT = 16;

export async function gerarHashSenha(
  senha: string,
  custo = CUSTO_PADRAO,
): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const derivada = await scryptAsync(senha, salt, TAMANHO_CHAVE, {
    N: custo,
    // O Node limita a memória do scrypt por padrão; N alto exige folga.
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${custo}$${salt.toString("hex")}$${derivada.toString("hex")}`;
}

export async function verificarSenha(
  senha: string,
  guardado: string,
): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 4 || partes[0] !== "scrypt") return false;

  const custo = Number(partes[1]);
  if (!Number.isInteger(custo) || custo <= 0) return false;

  let salt: Buffer;
  let esperado: Buffer;
  try {
    salt = Buffer.from(partes[2], "hex");
    esperado = Buffer.from(partes[3], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || esperado.length === 0) return false;

  const derivada = await scryptAsync(senha, salt, esperado.length, {
    N: custo,
    maxmem: 64 * 1024 * 1024,
  });

  // Comparação em tempo constante: um `===` vazaria informação pelo tempo de
  // resposta (quanto do hash bateu antes de divergir).
  return timingSafeEqual(derivada, esperado);
}

// Senha inicial legível para o admin do seed — sem caracteres ambíguos
// (0/O, 1/l), porque ela costuma ser digitada a partir de um papel.
export function gerarSenhaProvisoria(tamanho = 12): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i++) {
    saida += alfabeto[bytes[i] % alfabeto.length];
  }
  return saida;
}
