// Garante que exista um administrador para o primeiro acesso — idempotente.
// Roda com `node` puro (sem tsx) a cada boot do container, como os seeds de
// catálogo e de salas.
//
// Comportamento:
//  - Se JÁ existe qualquer admin ativo, não faz nada (não mexe em senha de
//    ninguém, nunca "ressuscita" acesso).
//  - Se não existe, cria um a partir de ADMIN_INICIAL_LOGIN/ADMIN_INICIAL_SENHA.
//    Sem ADMIN_INICIAL_SENHA, sorteia uma senha e a imprime UMA VEZ no log do
//    boot — é a única vez que ela aparece em texto.
//  - A senha nasce provisória: a UI cobra a troca no primeiro acesso.
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scrypt } = require("node:crypto");

const prisma = new PrismaClient();

// Espelha lib/senha.ts (formato "scrypt$N$salt$hash"). Duplicado de propósito:
// este script roda em CommonJS puro, sem o build do Next/TS.
const CUSTO = 16384;
function gerarHash(senha) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(senha, salt, 64, { N: CUSTO, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e
        ? reject(e)
        : resolve(`scrypt$${CUSTO}$${salt.toString("hex")}$${key.toString("hex")}`),
    );
  });
}

function senhaSorteada(tamanho = 14) {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i++) saida += alfabeto[bytes[i] % alfabeto.length];
  return saida;
}

async function main() {
  const adminsAtivos = await prisma.usuario.count({
    where: { papel: "ADMIN", ativo: true },
  });
  if (adminsAtivos > 0) {
    console.log(`→ Administrador já existe (${adminsAtivos}). Nada a fazer.`);
    return;
  }

  const login = (process.env.ADMIN_INICIAL_LOGIN || "admin").trim();
  const informada = process.env.ADMIN_INICIAL_SENHA;
  const senha = informada || senhaSorteada();

  // Se o login já existe (ex: foi rebaixado ou inativado), promove em vez de
  // quebrar no unique — o objetivo é o sistema nunca ficar sem administrador.
  const existente = await prisma.usuario.findUnique({ where: { login } });
  if (existente) {
    await prisma.usuario.update({
      where: { login },
      data: { papel: "ADMIN", ativo: true },
    });
    console.log(`→ Usuário "${login}" promovido a ADMIN ativo (senha mantida).`);
    return;
  }

  await prisma.usuario.create({
    data: {
      login,
      nome: "Administrador do TI",
      papel: "ADMIN",
      senhaHash: await gerarHash(senha),
      senhaProvisoria: true,
    },
  });

  console.log(`→ Administrador inicial criado: login "${login}"`);
  if (!informada) {
    console.log("┌──────────────────────────────────────────────────────┐");
    console.log(`│ SENHA PROVISÓRIA: ${senha}`);
    console.log("│ Anote agora — ela não será exibida de novo.           │");
    console.log("│ Troque no primeiro acesso.                           │");
    console.log("└──────────────────────────────────────────────────────┘");
  } else {
    console.log("  (senha veio de ADMIN_INICIAL_SENHA; troque no 1º acesso)");
  }
}

main()
  .catch((e) => {
    console.error("Falha ao garantir administrador:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
