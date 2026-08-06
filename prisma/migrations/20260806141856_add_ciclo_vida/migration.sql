-- CreateTable
CREATE TABLE "Manutencao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "computadorId" TEXT,
    "celularId" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "custo" REAL,
    "chamadoId" TEXT,
    "abertaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" DATETIME,
    "observacoes" TEXT,
    CONSTRAINT "Manutencao_computadorId_fkey" FOREIGN KEY ("computadorId") REFERENCES "Computador" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Manutencao_celularId_fkey" FOREIGN KEY ("celularId") REFERENCES "Celular" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Manutencao_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Celular" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "apelido" TEXT,
    "numero" TEXT,
    "operadora" TEXT,
    "imei" TEXT,
    "observacoes" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'ativo',
    "dataAquisicao" DATETIME,
    "notaFiscal" TEXT,
    "garantiaAte" DATETIME,
    "valorCompra" REAL,
    "funcionarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Celular_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Celular" ("apelido", "atualizadoEm", "criadoEm", "funcionarioId", "id", "identificador", "imei", "numero", "observacoes", "operadora") SELECT "apelido", "atualizadoEm", "criadoEm", "funcionarioId", "id", "identificador", "imei", "numero", "observacoes", "operadora" FROM "Celular";
DROP TABLE "Celular";
ALTER TABLE "new_Celular" RENAME TO "Celular";
CREATE UNIQUE INDEX "Celular_identificador_key" ON "Celular"("identificador");
CREATE INDEX "Celular_funcionarioId_idx" ON "Celular"("funcionarioId");
CREATE INDEX "Celular_situacao_idx" ON "Celular"("situacao");
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
    "situacao" TEXT NOT NULL DEFAULT 'ativo',
    "dataAquisicao" DATETIME,
    "notaFiscal" TEXT,
    "garantiaAte" DATETIME,
    "valorCompra" REAL,
    "funcionarioId" TEXT,
    "salaId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Computador_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Computador_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Computador" ("apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes", "salaId", "senha", "temHeadset", "temMouse", "temTeclado") SELECT "apelido", "atualizadoEm", "contaOutlook", "criadoEm", "funcionarioId", "id", "identificador", "licencaMicrosoft", "licencaWindows", "loginPadrao", "observacoes", "salaId", "senha", "temHeadset", "temMouse", "temTeclado" FROM "Computador";
DROP TABLE "Computador";
ALTER TABLE "new_Computador" RENAME TO "Computador";
CREATE UNIQUE INDEX "Computador_identificador_key" ON "Computador"("identificador");
CREATE INDEX "Computador_funcionarioId_idx" ON "Computador"("funcionarioId");
CREATE INDEX "Computador_salaId_idx" ON "Computador"("salaId");
CREATE INDEX "Computador_situacao_idx" ON "Computador"("situacao");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Manutencao_computadorId_idx" ON "Manutencao"("computadorId");

-- CreateIndex
CREATE INDEX "Manutencao_celularId_idx" ON "Manutencao"("celularId");

-- CreateIndex
CREATE INDEX "Manutencao_chamadoId_idx" ON "Manutencao"("chamadoId");

-- CreateIndex
CREATE INDEX "Manutencao_concluidaEm_idx" ON "Manutencao"("concluidaEm");
