// globalSetup do vitest: prepara um SQLite descartável para os testes de API.
//
// Por que um banco de verdade e não mock do Prisma: o que está sob teste aqui é
// a autorização das rotas — quem enxerga o quê. Um Prisma dublê provaria só que
// o dublê responde o combinado; com banco real, um `where` errado numa consulta
// aparece como vazamento no teste, que é justamente o que queremos pegar.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const PASTA = resolve(process.cwd(), "tmp");
const ARQUIVO = resolve(PASTA, "test.db");

export const URL_BANCO_TESTE = `file:${ARQUIVO}`;

export async function setup(): Promise<void> {
  // Começa sempre do zero: teste que herda dado de execução anterior mente.
  rmSync(PASTA, { recursive: true, force: true });
  mkdirSync(PASTA, { recursive: true });

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: URL_BANCO_TESTE },
    stdio: "pipe",
  });
}

export async function teardown(): Promise<void> {
  rmSync(PASTA, { recursive: true, force: true });
}
