// A conversa do robô, turno a turno.
//
// O que se protege aqui, em ordem de gravidade:
//   1. valor não sai antes de CPF **e** nascimento conferidos;
//   2. nenhuma condição fora da regra oficial da carteira chega ao devedor;
//   3. o robô conversa mais, mas para onde tem de parar;
//   4. banco fora do ar vira gente, nunca silêncio nem palpite.
import { describe, expect, it } from "vitest";
import { decidir, type EstadoConversa, type Fontes } from "@/lib/chat-fluxo";
import { lerSaidaDoModelo, cpfValido, normalizarNascimento, extrairDados } from "@/lib/chat-intencao";
import { montarOferta, reais } from "@/lib/chat-respostas";
import type { Identificacao } from "@/lib/siscobra";

const CPF = "52998224725"; // válido nos dígitos verificadores
const NASC = "1985-04-12";

const NOVO: EstadoConversa = {
  devcod: null, carcod: null, identificadaEm: null, nome: null,
  saldo: null, vencidoDesde: null,
  cpfPendente: null, nascimentoPendente: null, ofertou: false,
};

const IDENTIFICADA: EstadoConversa = {
  ...NOVO,
  devcod: 999, carcod: 7, identificadaEm: new Date(), nome: "Maria",
  saldo: 1240, vencidoDesde: "12/03/2025",
};

const PESSOA: Identificacao = {
  devcod: 999, carcod: 7, carteira: "Banco X", primeiroNome: "Maria",
  cpfMascarado: "529.***.***-25", saldo: 1240, vencidoDesde: "12/03/2025",
};

function fontes(over: Partial<Fontes> = {}): Fontes {
  return {
    identificar: async () => ({ achou: [PESSOA], erro: false }),
    regraDaCarteira: async () => ({
      maxParcelas: 6, valorMinimoParcela: 50, descontoMaximoPercentual: 30,
    }),
    ...over,
  };
}

const ler = (intencao: string, msg = "", extra: object = {}) =>
  lerSaidaDoModelo(JSON.stringify({ intencao, ...extra }), msg);

// ─────────────────────── a trava que sustenta tudo ───────────────────────

describe("valor não sai sem identificação", () => {
  for (const intencao of ["consultar_saldo", "quer_negociar", "quer_boleto"]) {
    it(`"${intencao}" sem identificação pede CPF, não revela nada`, async () => {
      const a = await decidir(ler(intencao), NOVO, fontes());
      expect(a.tipo).toBe("responder");
      if (a.tipo === "responder") {
        expect(a.texto).toMatch(/CPF/i);
        expect(a.texto).not.toMatch(/R\$/); // nenhum valor no texto
      }
    });
  }

  // Pedir em vez de escalar é o que dá conversa ao robô: escalar aqui jogaria
  // para a operadora um trabalho que é de formulário.
  it("pedir identificação NÃO é escalar", async () => {
    const a = await decidir(ler("consultar_saldo"), NOVO, fontes());
    expect(a.tipo).not.toBe("escalar");
  });

  it("CPF sozinho não identifica — pede a data e guarda o que veio", async () => {
    const a = await decidir(ler("identificar", `meu cpf é ${CPF}`), NOVO, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toMatch(/nascimento/i);
      expect(a.estado?.cpfPendente).toBe(CPF);
    }
  });

  it("a data chegando depois, junta com o CPF guardado e identifica", async () => {
    const a = await decidir(
      ler("identificar", "12/04/1985"),
      { ...NOVO, cpfPendente: CPF },
      fontes(),
    );
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toContain(reais(1240));
      expect(a.texto).toContain("12/03/2025");
      expect(a.estado?.identificadaEm).toBeInstanceOf(Date);
    }
  });
});

describe("quando a identificação não fecha", () => {
  it("cadastro não encontrado vai para gente, sem insistir", async () => {
    const a = await decidir(
      ler("identificar", `${CPF} 12/04/1985`),
      NOVO,
      fontes({ identificar: async () => ({ achou: [], erro: false }) }),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/não localizado/);
  });

  // Escolher uma carteira seria falar do contrato errado.
  it("mais de uma carteira não é escolhida pelo robô", async () => {
    const a = await decidir(
      ler("identificar", `${CPF} 12/04/1985`),
      NOVO,
      fontes({
        identificar: async () => ({ achou: [PESSOA, { ...PESSOA, carcod: 8 }], erro: false }),
      }),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/2 carteiras/);
  });

  it("banco fora do ar escala em vez de adivinhar", async () => {
    const a = await decidir(
      ler("identificar", `${CPF} 12/04/1985`),
      NOVO,
      fontes({ identificar: async () => ({ achou: [], erro: true }) }),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/não pôde ser consultado/);
  });
});

// ─────────────────────────── negociação ───────────────────────────

describe("negociar só dentro da regra oficial", () => {
  it("carteira SEM regra ativa não recebe proposta nenhuma", async () => {
    const a = await decidir(
      ler("quer_negociar"),
      IDENTIFICADA,
      fontes({ regraDaCarteira: async () => null }),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") {
      expect(a.motivo).toMatch(/sem regra/);
      expect(a.aviso).not.toMatch(/\d+x|R\$/); // não vaza número nenhum
    }
  });

  it("com regra, a oferta cabe nos limites e é dita com valor do banco", async () => {
    const a = await decidir(ler("quer_negociar"), IDENTIFICADA, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toContain("6x");
      expect(a.texto).toContain(reais(206.67)); // 1240 / 6, arredondado p/ cima
      expect(a.texto).toContain(reais(868));    // 1240 - 30%
      expect(a.estado?.ofertou).toBe(true);
    }
  });

  it("pedir mais parcelas que o teto não vira exceção — vira gente", async () => {
    const a = await decidir(
      ler("quer_negociar", "dá em 24x?", { parcelas: 24 }),
      IDENTIFICADA,
      fontes(),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/acima do teto/);
  });

  it("pedir menos parcelas que o teto é atendido", async () => {
    const a = await decidir(
      ler("quer_negociar", "consigo em 3x", { parcelas: 3 }),
      IDENTIFICADA,
      fontes(),
    );
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") expect(a.texto).toContain("3x");
  });

  it("aceitar sem proposta na mesa não fecha nada", async () => {
    const a = await decidir(ler("aceita"), IDENTIFICADA, fontes());
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/sem proposta/);
  });

  // Quem grava acordo no CRM é a operadora: o robô não escreve no Siscobra.
  it("aceite com proposta na mesa passa para gente registrar", async () => {
    const a = await decidir(ler("aceita"), { ...IDENTIFICADA, ofertou: true }, fontes());
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") {
      expect(a.motivo).toMatch(/aceitou/);
      expect(a.aviso).toMatch(/atendente/i);
    }
  });
});

describe("o que nunca é do robô", () => {
  for (const [intencao, esperado] of [
    ["ja_pagou", /pagou/],
    ["contesta", /contesta/],
    ["juridico", /jurídica/],
    ["outro", /fora do que o robô atende/],
  ] as const) {
    it(`"${intencao}" vai para gente mesmo identificada`, async () => {
      const a = await decidir(ler(intencao), IDENTIFICADA, fontes());
      expect(a.tipo).toBe("escalar");
      if (a.tipo === "escalar") expect(a.motivo).toMatch(esperado);
    });
  }
});

// ────────────────── o modelo não tem por onde inventar ──────────────────

describe("a saída do modelo é uma palavra de uma lista", () => {
  it("rótulo inventado vira 'outro', que é gente", () => {
    expect(lerSaidaDoModelo('{"intencao":"conceder_perdao_total"}', "").intencao).toBe("outro");
  });

  it("JSON quebrado vira 'outro'", () => {
    expect(lerSaidaDoModelo("não sou json", "").intencao).toBe("outro");
  });

  // Se o modelo devolvesse texto para o devedor, este teste não existiria —
  // e é justamente por isso que ele não devolve.
  it("texto livre do modelo é ignorado por completo", () => {
    const l = lerSaidaDoModelo(
      '{"intencao":"saudacao","resposta":"Você deve R$ 5.000,00","texto":"oi"}',
      "",
    );
    expect(l.intencao).toBe("saudacao");
    expect(JSON.stringify(l)).not.toContain("5.000");
  });

  it("o que a regex acha vence o que o modelo diz", () => {
    const l = lerSaidaDoModelo(
      `{"intencao":"identificar","cpf":"00000000000"}`,
      `anota aí ${CPF}`,
    );
    expect(l.cpf).toBe(CPF);
  });
});

describe("CPF e data, conferidos antes de consultar o banco", () => {
  it("dígito verificador errado não é CPF", () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
  });

  it("data que o calendário não tem é recusada, não rolada", () => {
    expect(normalizarNascimento("12/04/1985")).toBe("1985-04-12");
    expect(normalizarNascimento("31/02/1985")).toBeNull();
    expect(normalizarNascimento("12/13/1985")).toBeNull();
    expect(normalizarNascimento("12/04/2030")).toBeNull();
  });

  it("acha CPF e data no meio da frase", () => {
    const d = extrairDados(`oi, sou a maria, cpf ${CPF}, nasci em 12/04/1985`);
    expect(d.cpf).toBe(CPF);
    expect(d.nascimento).toBe("1985-04-12");
  });
});

describe("a oferta é aritmética, não opinião", () => {
  it("parcela arredonda para CIMA, senão a soma fica abaixo da dívida", () => {
    const o = montarOferta(1000, { maxParcelas: 3, valorMinimoParcela: null, descontoMaximoPercentual: 0 });
    expect(o?.valorParcela).toBe(333.34);
    expect((o!.valorParcela * 3) >= 1000).toBe(true);
  });

  it("respeita o piso da parcela reduzindo o número de vezes", () => {
    // 300 / 6 = 50, mas o piso é 100 → no máximo 3 parcelas.
    const o = montarOferta(300, { maxParcelas: 6, valorMinimoParcela: 100, descontoMaximoPercentual: 0 });
    expect(o?.parcelas).toBe(3);
  });

  it("dívida menor que o piso de uma parcela não vira oferta", () => {
    expect(montarOferta(30, { maxParcelas: 6, valorMinimoParcela: 100, descontoMaximoPercentual: 0 })).toBeNull();
  });

  it("sem saldo não há oferta", () => {
    expect(montarOferta(0, { maxParcelas: 6, valorMinimoParcela: null, descontoMaximoPercentual: 10 })).toBeNull();
  });
});
