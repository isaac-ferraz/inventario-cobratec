-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Computador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "apelido" TEXT,
    "observacoes" TEXT,
    "loginPadrao" TEXT,
    "licencaWindows" TEXT,
    "licencaMicrosoft" TEXT,
    "contaOutlook" TEXT,
    "temMouse" BOOLEAN NOT NULL DEFAULT true,
    "temTeclado" BOOLEAN NOT NULL DEFAULT true,
    "temHeadset" BOOLEAN NOT NULL DEFAULT false,
    "funcionarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Computador_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Computador" ("apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes") SELECT "apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes" FROM "Computador";
DROP TABLE "Computador";
ALTER TABLE "new_Computador" RENAME TO "Computador";
CREATE UNIQUE INDEX "Computador_identificador_key" ON "Computador"("identificador");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
