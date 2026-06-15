import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Testes de unidade das funções puras (validações zod e (de)serialização das
// especificações). Não tocam o banco — rodam rápido em ambiente node.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
