-- Computador: senha de acesso da máquina
ALTER TABLE "Computador" ADD COLUMN "senha" TEXT;

-- Funcionario: remove a matrícula e adiciona as senhas dos sistemas
-- (loginSiscobra/loginVonix já existem da migration anterior).
-- SQLite não tem DROP COLUMN com índice único, então recriamos a tabela.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Funcionario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "loginSiscobra" TEXT,
    "senhaSiscobra" TEXT,
    "loginVonix" TEXT,
    "senhaVonix" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Funcionario" ("id", "nome", "cargo", "ativo", "loginSiscobra", "loginVonix", "criadoEm")
SELECT "id", "nome", "cargo", "ativo", "loginSiscobra", "loginVonix", "criadoEm" FROM "Funcionario";
DROP TABLE "Funcionario";
ALTER TABLE "new_Funcionario" RENAME TO "Funcionario";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
