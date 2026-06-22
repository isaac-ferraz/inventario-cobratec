-- CreateTable
CREATE TABLE "Celular" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identificador" TEXT NOT NULL,
    "apelido" TEXT,
    "numero" TEXT,
    "operadora" TEXT,
    "imei" TEXT,
    "observacoes" TEXT,
    "funcionarioId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "Celular_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Celular_identificador_key" ON "Celular"("identificador");

-- CreateIndex
CREATE INDEX "Celular_funcionarioId_idx" ON "Celular"("funcionarioId");
