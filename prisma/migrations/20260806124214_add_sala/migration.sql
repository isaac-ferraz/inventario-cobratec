-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "predio" TEXT,
    "piso" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Computador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "apelido" TEXT,
    "observacoes" TEXT,
    "loginPadrao" TEXT,
    "senha" TEXT,
    "licencaWindows" TEXT,
    "licencaMicrosoft" TEXT,
    "contaOutlook" TEXT,
    "temMouse" BOOLEAN NOT NULL DEFAULT true,
    "temTeclado" BOOLEAN NOT NULL DEFAULT true,
    "temHeadset" BOOLEAN NOT NULL DEFAULT false,
    "funcionarioId" TEXT,
    "salaId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Computador_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Computador_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Computador" ("apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes", "senha", "temHeadset", "temMouse", "temTeclado") SELECT "apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes", "senha", "temHeadset", "temMouse", "temTeclado" FROM "Computador";
DROP TABLE "Computador";
ALTER TABLE "new_Computador" RENAME TO "Computador";
CREATE UNIQUE INDEX "Computador_identificador_key" ON "Computador"("identificador");
CREATE INDEX "Computador_funcionarioId_idx" ON "Computador"("funcionarioId");
CREATE INDEX "Computador_salaId_idx" ON "Computador"("salaId");
CREATE TABLE "new_Funcionario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "salaId" TEXT,
    "loginSiscobra" TEXT,
    "senhaSiscobra" TEXT,
    "loginVonix" TEXT,
    "senhaVonix" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Funcionario_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Funcionario" ("ativo", "cargo", "criadoEm", "id", "loginSiscobra", "loginVonix", "nome", "senhaSiscobra", "senhaVonix") SELECT "ativo", "cargo", "criadoEm", "id", "loginSiscobra", "loginVonix", "nome", "senhaSiscobra", "senhaVonix" FROM "Funcionario";
DROP TABLE "Funcionario";
ALTER TABLE "new_Funcionario" RENAME TO "Funcionario";
CREATE INDEX "Funcionario_salaId_idx" ON "Funcionario"("salaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Sala_nome_key" ON "Sala"("nome");
