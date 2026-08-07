-- CreateTable
CREATE TABLE "SupervisorSala" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupervisorSala_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupervisorSala_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SupervisorSala_usuarioId_idx" ON "SupervisorSala"("usuarioId");

-- CreateIndex
CREATE INDEX "SupervisorSala_salaId_idx" ON "SupervisorSala"("salaId");

-- CreateIndex
CREATE UNIQUE INDEX "SupervisorSala_usuarioId_salaId_key" ON "SupervisorSala"("usuarioId", "salaId");
