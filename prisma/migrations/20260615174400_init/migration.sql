-- CreateTable
CREATE TABLE "Funcionario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "matricula" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Computador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "apelido" TEXT,
    "observacoes" TEXT,
    "funcionarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Computador_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TipoComponente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Componente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "computadorId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "especificacoes" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Componente_computadorId_fkey" FOREIGN KEY ("computadorId") REFERENCES "Computador" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Componente_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoComponente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Funcionario_matricula_key" ON "Funcionario"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "Computador_identificador_key" ON "Computador"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "TipoComponente_nome_key" ON "TipoComponente"("nome");
