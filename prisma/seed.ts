// Seed inicial: catálogo de tipos de componente comuns + dados de exemplo.
import { PrismaClient } from "@prisma/client";
// Lista única do catálogo (também usada pelo seed-catalogo.cjs no boot).
import catalogo from "./catalogo.cjs";

const prisma = new PrismaClient();

async function main() {
  // Catálogo inicial de tipos (editável depois pela UI)
  for (const nome of catalogo.TIPOS_PADRAO) {
    await prisma.tipoComponente.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
  }

  // Funcionários de exemplo
  const ana = await prisma.funcionario.create({
    data: {
      nome: "Ana Souza",
      cargo: "Operadora",
      loginSiscobra: "ana.souza",
      loginVonix: "ana.souza",
    },
  });
  const carlos = await prisma.funcionario.create({
    data: {
      nome: "Carlos Lima",
      cargo: "Gestor",
      loginSiscobra: "carlos.lima",
      loginVonix: "carlos.lima",
    },
  });

  const tipoProc = await prisma.tipoComponente.findUniqueOrThrow({
    where: { nome: "Processador" },
  });
  const tipoRam = await prisma.tipoComponente.findUniqueOrThrow({
    where: { nome: "Memória RAM" },
  });
  const tipoArm = await prisma.tipoComponente.findUniqueOrThrow({
    where: { nome: "Armazenamento" },
  });

  // Computador da Ana
  await prisma.computador.create({
    data: {
      identificador: "PAT-1001",
      apelido: "PC Atendimento 01",
      funcionarioId: ana.id,
      componentes: {
        create: [
          { tipoId: tipoProc.id, descricao: "Intel Core i5-10400" },
          {
            tipoId: tipoRam.id,
            descricao: "Kingston 8GB DDR4 2666MHz",
            especificacoes: JSON.stringify({ capacidadeGB: 8, tecnologia: "DDR4" }),
          },
          {
            tipoId: tipoArm.id,
            descricao: "SSD Kingston 240GB",
            especificacoes: JSON.stringify({ capacidadeGB: 240, tipo: "SSD" }),
          },
        ],
      },
    },
  });

  // Computador do Carlos
  await prisma.computador.create({
    data: {
      identificador: "PAT-1002",
      apelido: "Notebook Gestão",
      funcionarioId: carlos.id,
      componentes: {
        create: [
          { tipoId: tipoProc.id, descricao: "Intel Core i7-1165G7" },
          {
            tipoId: tipoRam.id,
            descricao: "16GB DDR4",
            especificacoes: JSON.stringify({ capacidadeGB: 16, tecnologia: "DDR4" }),
          },
        ],
      },
    },
  });

  // Computador em estoque (sem funcionário)
  await prisma.computador.create({
    data: {
      identificador: "PAT-1003",
      apelido: "Reserva TI",
      observacoes: "Máquina de estoque para reposição.",
    },
  });

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
