// Como o robô chama o devedor pelo nome.
//
// Parece cosmético e não é: estas frases são a voz da empresa na cara de alguém
// que está sendo cobrado. "Olá, PEDRO!" — em caixa alta, porque é assim que o
// Siscobra guarda — soa como grito, e foi o que apareceu no primeiro
// atendimento de verdade.
import { describe, expect, it } from "vitest";
import { nomeProprio, RESPOSTAS } from "@/lib/chat-respostas";

describe("nomeProprio", () => {
  it("desfaz a caixa alta do cadastro", () => {
    expect(nomeProprio("PEDRO")).toBe("Pedro");
    expect(nomeProprio("MARIA")).toBe("Maria");
  });

  it("não estraga nome que já está bem escrito", () => {
    expect(nomeProprio("Gabrieli")).toBe("Gabrieli");
    expect(nomeProprio("José")).toBe("José");
  });

  // Razão social que começa com dígito existe no cadastro (decisão 32.3), e um
  // `toLowerCase` seco a transformaria em "7m".
  it("preserva razão social que começa com número", () => {
    expect(nomeProprio("7M")).toBe("7M");
    expect(nomeProprio("3C")).toBe("3C");
  });
});

describe("abertura das mensagens", () => {
  it("com nome, chama pela pessoa — sem 'Olá' e sem gritar", () => {
    const t = RESPOSTAS.saudacao("PEDRO");
    expect(t).toMatch(/^Pedro, tudo bem\? Aqui é a Cobratec\./);
    expect(t).not.toMatch(/Olá/);
    expect(t).not.toMatch(/PEDRO/);
  });

  it("sem nome, abre com Olá e a frase começa em maiúscula", () => {
    expect(RESPOSTAS.saudacao(null)).toMatch(/^Olá! Tudo bem\? Aqui é a Cobratec\./);
  });

  // O que fazia a conversa morrer: a primeira fala era um aviso, e a pessoa
  // ficava sem nada para responder.
  it("a primeira fala termina em pergunta", () => {
    expect(RESPOSTAS.saudacao("PEDRO").trim().endsWith("?")).toBe(true);
  });

  // Antes de conferir documento e nome não se sabe com quem se fala: afirmar
  // pendência a quem herdou a linha conta a um estranho que o antigo dono devia.
  it("a primeira fala NÃO afirma que existe dívida", () => {
    const t = RESPOSTAS.saudacao("PEDRO");
    expect(t).toMatch(/se há algo em aberto/);
    expect(t).not.toMatch(/sua dívida|seu débito|você deve/i);
  });

  it("o segundo cumprimento é OUTRA frase, e aponta o caminho", () => {
    const a = RESPOSTAS.saudacao("PEDRO");
    const b = RESPOSTAS.saudacaoDeNovo("PEDRO");
    expect(b).not.toBe(a);
    expect(b).toMatch(/^Pedro, estou por aqui\./);
    expect(b).toMatch(/consultar|acordo/);
  });

  // O detalhe que quase passou: emendar "Pedro, " num texto que já começava em
  // maiúscula produzia "Pedro, Localizei…" — erro de português na cara do devedor.
  it("depois da vírgula a frase segue em minúscula", () => {
    const t = RESPOSTAS.saldo({ nome: "PEDRO", saldo: 6558.61, vencidoDesde: "30/03/2026" });
    expect(t).toMatch(/^Pedro, localizei seu cadastro\./);
    // "R$" e o número são separados por espaço NÃO separável (U+00A0) pelo
    // Intl: comparar com espaço comum falharia por um caractere invisível.
    expect(t).toContain("6.558,61");
    expect(t).toContain("30/03/2026");
  });

  // Antes da identificação o nome vem do pushName do WhatsApp, que é texto
  // livre: "Isaac Ferraz - Cobratec" é um pushName real, visto em teste.
  it("usa só o primeiro nome, mesmo com pushName comprido", () => {
    expect(RESPOSTAS.saudacao("Isaac Ferraz - Cobratec")).toMatch(/^Isaac, tudo bem/);
    expect(RESPOSTAS.saudacao("MARIA APARECIDA SOUZA")).toMatch(/^Maria, tudo bem/);
  });

  it("nome só com espaços cai no Olá, não em vírgula solta", () => {
    expect(RESPOSTAS.saudacao("   ")).toMatch(/^Olá! Tudo bem/);
  });

  it("sem nome, o saldo também abre certo", () => {
    const t = RESPOSTAS.saldo({ nome: null, saldo: 100, vencidoDesde: null });
    expect(t).toMatch(/^Olá! Localizei seu cadastro\./);
  });
});
