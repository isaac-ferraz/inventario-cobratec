// Garante as salas iniciais do escritório — idempotente (upsert por nome).
// Roda com `node` puro (sem tsx), por isso é CommonJS: o entrypoint do Docker
// o executa a cada boot, como o seed do catálogo de tipos.
//
// `update: {}` de propósito: se o TI renomear prédio/piso/ordem ou desativar uma
// sala pela UI, o boot seguinte NÃO desfaz a alteração.
const { PrismaClient } = require("@prisma/client");
const { SALAS_PADRAO } = require("./salas.cjs");

const prisma = new PrismaClient();

async function main() {
  for (const sala of SALAS_PADRAO) {
    await prisma.sala.upsert({
      where: { nome: sala.nome },
      update: {},
      create: sala,
    });
  }
  console.log(`→ Salas garantidas (${SALAS_PADRAO.length}).`);
}

main()
  .catch((e) => {
    console.error("Falha ao garantir salas:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
