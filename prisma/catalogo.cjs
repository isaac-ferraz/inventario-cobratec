// Fonte única do catálogo padrão de tipos de componente.
// Usado pelo seed completo (prisma/seed.ts) e pelo seed só-de-catálogo
// (prisma/seed-catalogo.cjs, rodado no boot do container).
const TIPOS_PADRAO = [
  "Processador",
  "Memória RAM",
  "Armazenamento",
  "Placa de Vídeo",
  "Placa-mãe",
  "Fonte",
  "Monitor",
  "Sistema Operacional",
];

module.exports = { TIPOS_PADRAO };
