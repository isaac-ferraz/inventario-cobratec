import { describe, it, expect } from "vitest";
import { gerarHashSenha, verificarSenha, gerarSenhaProvisoria } from "./senha";

// Custo baixo só no teste: o padrão (16384) é proposital para ser lento.
const CUSTO_TESTE = 1024;

describe("hash de senha", () => {
  it("não guarda a senha em texto", async () => {
    const hash = await gerarHashSenha("segredo-do-ti", CUSTO_TESTE);
    expect(hash).not.toContain("segredo-do-ti");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatório)", async () => {
    const a = await gerarHashSenha("mesma-senha", CUSTO_TESTE);
    const b = await gerarHashSenha("mesma-senha", CUSTO_TESTE);
    expect(a).not.toBe(b);
    // ...mas as duas continuam validando.
    expect(await verificarSenha("mesma-senha", a)).toBe(true);
    expect(await verificarSenha("mesma-senha", b)).toBe(true);
  });

  it("aceita a senha correta e recusa a errada", async () => {
    const hash = await gerarHashSenha("Cobratec@2026", CUSTO_TESTE);
    expect(await verificarSenha("Cobratec@2026", hash)).toBe(true);
    expect(await verificarSenha("cobratec@2026", hash)).toBe(false);
    expect(await verificarSenha("", hash)).toBe(false);
  });

  it("recusa hash malformado sem lançar exceção", async () => {
    for (const ruim of ["", "nada", "scrypt$x$y", "bcrypt$1$aa$bb", "scrypt$0$aa$bb"]) {
      expect(await verificarSenha("qualquer", ruim)).toBe(false);
    }
  });
});

describe("senha provisória", () => {
  it("tem o tamanho pedido e evita caracteres ambíguos", () => {
    const s = gerarSenhaProvisoria(16);
    expect(s).toHaveLength(16);
    // 0/O e 1/l confundem quem digita a partir de um papel.
    expect(s).not.toMatch(/[0O1lI]/);
  });

  it("não repete entre chamadas", () => {
    const geradas = new Set(
      Array.from({ length: 20 }, () => gerarSenhaProvisoria()),
    );
    expect(geradas.size).toBe(20);
  });
});
