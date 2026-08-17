-- CreateTable
CREATE TABLE "TarefaAgendada" (
    "nome" TEXT NOT NULL PRIMARY KEY,
    "ultimoDia" TEXT,
    "ultimaExecucao" DATETIME,
    "ultimoResultado" TEXT,
    "ultimoDetalhe" TEXT,
    "duracaoMs" INTEGER
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'info',
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "link" TEXT,
    "chave" TEXT NOT NULL,
    "lidoEm" DATETIME,
    "entrega" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FechamentoDiario" (
    "dia" TEXT NOT NULL PRIMARY KEY,
    "acordosQtd" INTEGER NOT NULL DEFAULT 0,
    "acordosValor" REAL NOT NULL DEFAULT 0,
    "acionamentosQtd" INTEGER NOT NULL DEFAULT 0,
    "acionamentosDev" INTEGER NOT NULL DEFAULT 0,
    "aVencer7Qtd" INTEGER NOT NULL DEFAULT 0,
    "aVencer7Valor" REAL NOT NULL DEFAULT 0,
    "atrasoQtd" INTEGER NOT NULL DEFAULT 0,
    "atrasoValor" REAL NOT NULL DEFAULT 0,
    "quebrasQtd" INTEGER NOT NULL DEFAULT 0,
    "quebrasValor" REAL NOT NULL DEFAULT 0,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Aviso_chave_key" ON "Aviso"("chave");

-- CreateIndex
CREATE INDEX "Aviso_lidoEm_criadoEm_idx" ON "Aviso"("lidoEm", "criadoEm");

-- CreateIndex
CREATE INDEX "Aviso_tipo_idx" ON "Aviso"("tipo");
