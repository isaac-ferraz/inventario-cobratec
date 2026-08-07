import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Dois tipos de teste convivem aqui:
//
// - `lib/**/*.test.ts` — funções puras (validações, regras de chamado, ciclo de
//   vida). Rodam em milissegundos e não tocam nada.
// - `tests/api/**/*.test.ts` — rotas de API contra um SQLite descartável. É onde
//   a autorização (401/403/404, nota interna, travas de admin) fica protegida.
//
// `fileParallelism: false` porque os testes de API compartilham o mesmo arquivo
// de banco: dois arquivos escrevendo ao mesmo tempo dariam falha intermitente.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/api/**/*.test.ts"],
    globalSetup: ["tests/setup-banco.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: `file:${resolve(__dirname, "tmp/test.db")}`,
      // Segredo só de teste: as rotas exigem AUTH_SECRET para assinar sessão.
      AUTH_SECRET: "segredo-apenas-para-testes-automatizados",
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
