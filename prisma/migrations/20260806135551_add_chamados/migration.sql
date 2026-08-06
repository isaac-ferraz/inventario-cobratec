-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "solicitanteId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "computadorId" TEXT,
    "celularId" TEXT,
    "salaId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    "resolvidoEm" DATETIME,
    CONSTRAINT "Chamado_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Chamado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Chamado_computadorId_fkey" FOREIGN KEY ("computadorId") REFERENCES "Computador" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Chamado_celularId_fkey" FOREIGN KEY ("celularId") REFERENCES "Celular" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Chamado_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChamadoMensagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chamadoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "interna" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChamadoMensagem_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChamadoMensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_numero_key" ON "Chamado"("numero");

-- CreateIndex
CREATE INDEX "Chamado_status_idx" ON "Chamado"("status");

-- CreateIndex
CREATE INDEX "Chamado_solicitanteId_idx" ON "Chamado"("solicitanteId");

-- CreateIndex
CREATE INDEX "Chamado_responsavelId_idx" ON "Chamado"("responsavelId");

-- CreateIndex
CREATE INDEX "Chamado_criadoEm_idx" ON "Chamado"("criadoEm");

-- CreateIndex
CREATE INDEX "ChamadoMensagem_chamadoId_criadoEm_idx" ON "ChamadoMensagem"("chamadoId", "criadoEm");

-- CreateIndex
CREATE INDEX "ChamadoMensagem_autorId_idx" ON "ChamadoMensagem"("autorId");
