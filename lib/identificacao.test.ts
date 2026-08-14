// Documento + nome do titular: a dupla verificação depois da decisão 34.
//
// Os nomes de cadastro daqui saíram do banco de produção (leitura, 13/08/2026):
// o código grudado, a razão social com pontuação, o cadastro de uma palavra só.
import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  cpfValido,
  extrairDocumento,
  extrairNome,
  nomeConfere,
  normalizarDocumento,
  normalizarNome,
  pedacosDoNome,
} from "@/lib/identificacao";

const GABRIELI = "760361Gabrieli Diniz De Sousa";

describe("normalizarNome", () => {
  it("tira acento, caixa, pontuação e o código de cadastro", () => {
    expect(normalizarNome(GABRIELI)).toBe("GABRIELI DINIZ DE SOUSA");
    expect(normalizarNome("José Antônio D'Ávila")).toBe("JOSE ANTONIO D AVILA");
    expect(normalizarNome("S.S.REPRESENTAÇOES COM.LTDA ME")).toBe(
      "S S REPRESENTACOES COM LTDA ME",
    );
    expect(normalizarNome(null)).toBe("");
  });
});

describe("pedacosDoNome", () => {
  it("descarta partícula, letra solta e sufixo de razão social", () => {
    expect(pedacosDoNome(GABRIELI).sort()).toEqual(["DINIZ", "GABRIELI", "SOUSA"]);
    // LTDA/ME/COMERCIO batem em milhares de cadastros: não provam nada.
    expect(pedacosDoNome("DROGA SIM COMERCIAL LTDA ME")).not.toContain("LTDA");
    expect(pedacosDoNome("DROGA SIM COMERCIAL LTDA ME")).not.toContain("ME");
  });
});

describe("nomeConfere — dois pedaços quaisquer", () => {
  it("aceita nome do meio omitido", () => {
    expect(nomeConfere("Gabrieli Sousa", GABRIELI)).toBe(true);
  });

  it("aceita ordem trocada", () => {
    expect(nomeConfere("Sousa Gabrieli", GABRIELI)).toBe(true);
  });

  it("aceita o nome inteiro, com acento e caixa quaisquer", () => {
    expect(nomeConfere("gabrieli diniz de sousa", GABRIELI)).toBe(true);
    expect(nomeConfere("JOÃO DA SILVA", "Joao Da Silva")).toBe(true);
  });

  // O ponto da regra: um pedaço só é o que qualquer parente sabe.
  it("recusa um pedaço só", () => {
    expect(nomeConfere("Gabrieli", GABRIELI)).toBe(false);
    expect(nomeConfere("Sousa", GABRIELI)).toBe(false);
  });

  it("recusa só partícula, que não prova nada", () => {
    expect(nomeConfere("de sousa", GABRIELI)).toBe(false);
    expect(nomeConfere("da silva", "Joao Da Silva")).toBe(false);
  });

  it("recusa nome de outra pessoa", () => {
    expect(nomeConfere("Maria Oliveira", GABRIELI)).toBe(false);
    // Um acerto só, entre dois pedaços digitados, continua sendo um.
    expect(nomeConfere("Gabrieli Oliveira", GABRIELI)).toBe(false);
  });

  // Existe no banco: "735705Violene". Exigir dois seria exigir o impossível.
  it("cadastro de uma palavra só exige aquele único pedaço", () => {
    expect(nomeConfere("Violene", "735705Violene")).toBe(true);
    expect(nomeConfere("Violeta", "735705Violene")).toBe(false);
  });

  it("empresa confere pela razão social, sem os sufixos", () => {
    expect(nomeConfere("Droga Sim Comercial", "DROGA SIM COMERCIAL LTDA ME NC")).toBe(true);
    // Só os sufixos: bateria em qualquer empresa do banco, então não vale.
    expect(nomeConfere("LTDA ME", "DROGA SIM COMERCIAL LTDA ME NC")).toBe(false);
  });

  it("cadastro vazio nunca confere", () => {
    expect(nomeConfere("Qualquer Nome", null)).toBe(false);
    expect(nomeConfere("Qualquer Nome", "735705")).toBe(false);
  });
});

describe("documento", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224726")).toBe(false); // último dígito trocado
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });

  it("valida CNPJ pelos dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });

  it("normalizar diz qual dos dois é", () => {
    expect(normalizarDocumento("529.982.247-25")).toEqual({
      digitos: "52998224725",
      tipo: "cpf",
    });
    expect(normalizarDocumento("11.222.333/0001-81")).toEqual({
      digitos: "11222333000181",
      tipo: "cnpj",
    });
    expect(normalizarDocumento("12345")).toBeNull();
  });

  it("acha o documento no meio da frase", () => {
    expect(extrairDocumento("meu cpf é 529.982.247-25, obrigado")?.digitos).toBe(
      "52998224725",
    );
    expect(extrairDocumento("cnpj 11222333000181")?.tipo).toBe("cnpj");
  });

  // 14 dígitos contêm 11: procurar CPF antes acharia um "CPF" dentro do CNPJ.
  it("num CNPJ, não devolve um CPF de mentira tirado de dentro dele", () => {
    const d = extrairDocumento("11.222.333/0001-81");
    expect(d?.tipo).toBe("cnpj");
    expect(d?.digitos).toHaveLength(14);
  });

  it("número que não é documento nenhum não vira documento", () => {
    expect(extrairDocumento("meu pedido é 12345")).toBeNull();
    expect(extrairDocumento("sem número aqui")).toBeNull();
  });
});

describe("extrairNome", () => {
  it("tira o recado e devolve o nome", () => {
    expect(extrairNome("meu nome é Gabrieli Diniz de Sousa")).toBe(
      "GABRIELI DINIZ SOUSA",
    );
    expect(extrairNome("Bom dia, sou Joao Silva")).toBe("JOAO SILVA");
  });

  it("tira os números, que são o documento e não o nome", () => {
    expect(extrairNome("529.982.247-25 Gabrieli Sousa")).toBe("GABRIELI SOUSA");
  });

  it("devolve null com menos de dois pedaços — aí o robô pede o nome completo", () => {
    expect(extrairNome("Gabrieli")).toBeNull();
    expect(extrairNome("bom dia")).toBeNull();
    expect(extrairNome("529.982.247-25")).toBeNull();
  });
});
