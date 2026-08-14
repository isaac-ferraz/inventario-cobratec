-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversa" (
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
    "saudacoes" INTEGER NOT NULL DEFAULT 0,
    "documentoPendente" TEXT,
    "nomePendente" TEXT,
    "saldo" REAL,
    "vencidoDesde" TEXT,
    "oferta" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaMensagemEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encerradaEm" DATETIME,
    CONSTRAINT "Conversa_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversa" ("carteira", "criadoEm", "documentoPendente", "dossie", "dossieEm", "encerradaEm", "id", "identificadaEm", "motivoEscalonamento", "nome", "nomePendente", "oferta", "responsavelId", "saldo", "siscobraCarcod", "siscobraDevcod", "situacao", "telefone", "ultimaMensagemEm", "vencidoDesde") SELECT "carteira", "criadoEm", "documentoPendente", "dossie", "dossieEm", "encerradaEm", "id", "identificadaEm", "motivoEscalonamento", "nome", "nomePendente", "oferta", "responsavelId", "saldo", "siscobraCarcod", "siscobraDevcod", "situacao", "telefone", "ultimaMensagemEm", "vencidoDesde" FROM "Conversa";
DROP TABLE "Conversa";
ALTER TABLE "new_Conversa" RENAME TO "Conversa";
CREATE UNIQUE INDEX "Conversa_telefone_key" ON "Conversa"("telefone");
CREATE INDEX "Conversa_situacao_ultimaMensagemEm_idx" ON "Conversa"("situacao", "ultimaMensagemEm");
CREATE INDEX "Conversa_responsavelId_idx" ON "Conversa"("responsavelId");
CREATE INDEX "Conversa_siscobraDevcod_idx" ON "Conversa"("siscobraDevcod");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
