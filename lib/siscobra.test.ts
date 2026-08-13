// O primeiro nome do devedor, limpo do código de cadastro.
//
// Todos os exemplos daqui saíram do banco de produção (consulta de leitura, em
// 13/08/2026). Não são casos inventados para o teste passar: são as formas que
// o `devnom` realmente tem, e é por isso que a exceção do "um dígito só" existe.
import { describe, expect, it } from "vitest";
import { primeiroNomeDe } from "@/lib/siscobra";

describe("primeiroNomeDe", () => {
  it("tira o código colado no nome — o caso que motivou a correção", () => {
    // Este é o CPF 09058307174, que o robô cumprimentava como "760361Gabrieli".
    expect(primeiroNomeDe("760361Gabrieli Diniz De Sousa")).toBe("Gabrieli");
    expect(primeiroNomeDe("735705Violene Badio")).toBe("Violene");
    expect(primeiroNomeDe("702081Max Linder Gaston")).toBe("Max");
  });

  it("tira o código separado por espaço, que o split_part já resolvia", () => {
    expect(primeiroNomeDe("40067713 ANA CLAUDIA DE ARRUDA MELO")).toBe("ANA");
    expect(primeiroNomeDe("52514223 KELLY CRISTINA SILVA DOS SANTOS")).toBe("KELLY");
  });

  // A razão de ser do "2 ou mais". Um dígito inicial é nome de empresa neste
  // banco, e cortá-lo estragaria a razão social.
  it("NÃO corta um dígito só, que é razão social de verdade", () => {
    expect(primeiroNomeDe("7M INSTALACOES LTDA")).toBe("7M");
    expect(primeiroNomeDe("3F SERVICOS INDUSTRIAIS LTDA")).toBe("3F");
    expect(primeiroNomeDe("3C SERVICES S A")).toBe("3C");
    expect(primeiroNomeDe("2RA CORRETORA DE SEGUROS")).toBe("2RA");
  });

  // Este devolve "3", e é de propósito — não é caso esquecido.
  //
  // Um dígito SOZINHO no início também é nome: "3 B S COMERCIO" é a razão
  // social 3BS. O critério é o tamanho da corrida, não se ela está colada:
  // 1 dígito é nome (7M, 3C, 3 B S), 2+ é código de cadastro (6 a 8 casas).
  // Quem vier "consertar" isto para cortar todo dígito inicial vai transformar
  // "7M INSTALACOES" em "M INSTALACOES".
  it("um dígito isolado no início também é parte do nome", () => {
    expect(primeiroNomeDe("3 B S COMERCIO DE MADEIRAS E ESQUADRIAS LTDA")).toBe("3");
  });

  // Zero no lugar do O é erro de digitação, não código. Limpar produziria
  // "SANTS" — estragar o nome é pior que devolvê-lo como está.
  it("não mexe em dígito no meio da palavra", () => {
    expect(primeiroNomeDe("CICERO CHAVEIRO DOS SANT0S")).toBe("CICERO");
    expect(primeiroNomeDe("SANT0S DA SILVA")).toBe("SANT0S");
    expect(primeiroNomeDe("M0DESTO RODRIGUES")).toBe("M0DESTO");
  });

  it("tira o código grudado no fim quando o nome tem uma palavra só", () => {
    expect(primeiroNomeDe("Violene633370")).toBe("Violene");
    // Com sobrenome, o código do fim nem chega perto do primeiro nome.
    expect(primeiroNomeDe("Felipe Da Silva Malta633370")).toBe("Felipe");
  });

  it("deixa em paz o número que faz parte do nome da empresa", () => {
    expect(primeiroNomeDe("CONDOMINIO RESIDENCIAL 93")).toBe("CONDOMINIO");
    expect(primeiroNomeDe("CONSORCIO SNEF ISOLUX LINHA 15")).toBe("CONSORCIO");
  });

  // Sobrando nada, a saudação cai no "Olá!" sem nome — que já é o que acontece
  // com cadastro sem nome. Melhor sem nome que com um número.
  it("devolve null quando não sobra nome", () => {
    expect(primeiroNomeDe(null)).toBeNull();
    expect(primeiroNomeDe(undefined)).toBeNull();
    expect(primeiroNomeDe("")).toBeNull();
    expect(primeiroNomeDe("   ")).toBeNull();
    expect(primeiroNomeDe("735705")).toBeNull();
    expect(primeiroNomeDe("735705 ")).toBeNull();
  });
});
