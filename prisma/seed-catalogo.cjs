// Garante o catálogo padrão de tipos de componente — idempotente (upsert).
// Roda com `node` puro (sem tsx), por isso é CommonJS: o entrypoint do Docker
// o executa a cada boot, mantendo o catálogo sempre presente.
const { PrismaClient } = require("@prisma/client");
const { TIPOS_PADRAO } = require("./catalogo.cjs");

const prisma = new PrismaClient();

async function main() {
  for (const nome of TIPOS_PADRAO) {
    await prisma.tipoComponente.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }
  console.log(`→ Catálogo garantido (${TIPOS_PADRAO.length} tipos).`);
}

main()
  .catch((e) => {
    console.error("Falha ao garantir catálogo:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
