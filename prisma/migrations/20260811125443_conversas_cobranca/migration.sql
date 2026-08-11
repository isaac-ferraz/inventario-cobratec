-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "siscobraDevcod" INTEGER,
    "siscobraCarcod" INTEGER,
    "carteira" TEXT,
    "identificadaEm" DATETIME,
    "situacao" TEXT NOT NULL DEFAULT 'bot',
    "motivoEscalonamento" TEXT,
    "responsavelId" TEXT,
    "dossie" TEXT,
    "dossieEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaMensagemEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" DATETIME,
    CONSTRAINT "Conversa_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversaMensagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversaId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorId" TEXT,
    "corpo" TEXT NOT NULL,
    "waId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversaMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversaMensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_telefone_key" ON "Conversa"("telefone");

-- CreateIndex
CREATE INDEX "Conversa_situacao_ultimaMensagemEm_idx" ON "Conversa"("situacao", "ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "Conversa_responsavelId_idx" ON "Conversa"("responsavelId");

-- CreateIndex
CREATE INDEX "Conversa_siscobraDevcod_idx" ON "Conversa"("siscobraDevcod");

-- CreateIndex
CREATE UNIQUE INDEX "ConversaMensagem_waId_key" ON "ConversaMensagem"("waId");

-- CreateIndex
CREATE INDEX "ConversaMensagem_conversaId_criadoEm_idx" ON "ConversaMensagem"("conversaId", "criadoEm");

-- CreateIndex
CREATE INDEX "ConversaMensagem_autorId_idx" ON "ConversaMensagem"("autorId");
