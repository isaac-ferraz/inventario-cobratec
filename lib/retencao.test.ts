// A política de retenção. Sem banco: o que se testa é a decisão, não o apagar.
//
// Vale o dobro aqui porque o erro é irreversível. Uma janela lida errado do
// `.env` não dá exceção — ela apaga conversa de devedor e o defeito só aparece
// quando alguém for procurar a prova de um acordo.
import { describe, expect, it } from "vitest";
import {
  AUDITORIA_DIAS_PADRAO,
  CONVERSAS_DIAS_MINIMO,
  CONVERSAS_DIAS_PADRAO,
  configRetencao,
  limiteConversas,
  nadaAPurgar,
  PURGA_VAZIA,
  resumoPurga,
} from "@/lib/retencao";

describe("configRetencao", () => {
  it("o padrão é conservador e seco", () => {
    const c = configRetencao({});
    expect(c.conversasDias).toBe(CONVERSAS_DIAS_PADRAO);
    expect(c.auditoriaDias).toBe(AUDITORIA_DIAS_PADRAO);
    // O padrão NUNCA pode ser destrutivo: a primeira execução de uma rotina que
    // apaga tem que ser conferida por gente.
    expect(c.modo).toBe("seco");
  });

  it("só liga o modo ativo com a palavra exata", () => {
    expect(configRetencao({ PURGA_MODO: "ativo" }).modo).toBe("ativo");
    expect(configRetencao({ PURGA_MODO: "ATIVO" }).modo).toBe("seco");
    expect(configRetencao({ PURGA_MODO: "sim" }).modo).toBe("seco");
    expect(configRetencao({ PURGA_MODO: "1" }).modo).toBe("seco");
  });

  it("aceita uma janela maior", () => {
    expect(configRetencao({ RETENCAO_CONVERSAS_DIAS: "365" }).conversasDias).toBe(365);
  });

  it("ignora janela abaixo do piso", () => {
    // O dedo escorregando no .env não pode virar apagamento da semana passada.
    expect(configRetencao({ RETENCAO_CONVERSAS_DIAS: "3" }).conversasDias).toBe(
      CONVERSAS_DIAS_PADRAO,
    );
    expect(CONVERSAS_DIAS_MINIMO).toBeGreaterThan(0);
  });

  it("ignora lixo e número quebrado", () => {
    for (const v of ["", "abc", "-1", "0", "90.5", "1e9999"]) {
      expect(configRetencao({ RETENCAO_CONVERSAS_DIAS: v }).conversasDias).toBe(
        CONVERSAS_DIAS_PADRAO,
      );
    }
  });
});

describe("limiteConversas", () => {
  it("recua a quantidade certa de dias", () => {
    const limite = limiteConversas(new Date("2026-08-14T12:00:00Z"), 180);
    expect(limite.toISOString().slice(0, 10)).toBe("2026-02-15");
  });
});

describe("resumoPurga", () => {
  it("no modo seco deixa claro que nada foi apagado", () => {
    const t = resumoPurga(
      { conversas: 4, mensagens: 31, anexos: 2, orfaos: 1, auditoria: 900 },
      "seco",
    );
    expect(t).toContain("Modo seco");
    expect(t).toContain("nada foi apagado");
    expect(t).toContain("PURGA_MODO=ativo");
    expect(t).toContain("4 conversa(s)");
  });

  it("no modo ativo relata o que saiu", () => {
    const t = resumoPurga({ ...PURGA_VAZIA, conversas: 2, mensagens: 9 }, "ativo");
    expect(t).toContain("Removidos");
    expect(t).not.toContain("Modo seco");
  });

  it("nunca carrega dado de devedor", () => {
    // O texto vai por WhatsApp. Só número entra — e o teste existe para alguém
    // pensar duas vezes antes de acrescentar telefone "para facilitar".
    const t = resumoPurga({ conversas: 1, mensagens: 1, anexos: 1, orfaos: 0, auditoria: 0 }, "ativo");
    expect(t).not.toMatch(/\d{10,}/);
  });
});

describe("nadaAPurgar", () => {
  it("reconhece o nada", () => {
    expect(nadaAPurgar(PURGA_VAZIA)).toBe(true);
  });
  it("um órfão sozinho já é alguma coisa", () => {
    expect(nadaAPurgar({ ...PURGA_VAZIA, orfaos: 1 })).toBe(false);
  });
});
