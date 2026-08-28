import { describe, expect, it } from "vitest";
import {
  apelidoDeArquivo,
  explicarErro,
  lerArgumentos,
  nomeDoArquivo,
  ondeFicaOSiscobra,
} from "@/lib/relatorio-diario";

// O comando roda sozinho, disparado por um agente, de manhã, sem ninguém
// olhando. Cada caso abaixo é uma frase que o arquivo afirma em comentário e que
// sem teste ninguém confere.

const HOJE = "2026-08-27";

describe("linha de comando do relatório diário", () => {
  it("sem --dia, o relatório é o de ONTEM", () => {
    // A regra inteira do agente depende disto: chamado no dia 27, ele produz o
    // relatório do dia 26.
    expect(lerArgumentos([], HOJE).dia).toBe("2026-08-26");
  });

  it("atravessa a virada do mês para trás", () => {
    expect(lerArgumentos([], "2026-09-01").dia).toBe("2026-08-31");
    expect(lerArgumentos([], "2026-03-01").dia).toBe("2026-02-28");
  });

  it("sem --carteira, é a 1163 (Rede Drogal)", () => {
    expect(lerArgumentos([], HOJE).carteiras).toEqual([1163]);
  });

  it("aceita as duas formas, --chave valor e --chave=valor", () => {
    expect(lerArgumentos(["--carteira", "77"], HOJE).carteiras).toEqual([77]);
    expect(lerArgumentos(["--carteira=77"], HOJE).carteiras).toEqual([77]);
  });

  it("aceita várias carteiras separadas por vírgula", () => {
    expect(lerArgumentos(["--carteira", "12, 45 ,88"], HOJE).carteiras).toEqual([
      12, 45, 88,
    ]);
  });

  it("recusa código meio lido em vez de aceitar o pedaço", () => {
    // `parseInt("12abc")` devolveria 12 e o relatório sairia perfeito, da
    // carteira errada. É o erro que não deixa rastro.
    expect(() => lerArgumentos(["--carteira", "12abc"], HOJE)).toThrow(
      /inválido/,
    );
    expect(() => lerArgumentos(["--carteira", "0"], HOJE)).toThrow(/inválido/);
    expect(() => lerArgumentos(["--carteira", "-3"], HOJE)).toThrow(/inválido/);
    expect(() => lerArgumentos(["--carteira", "1.5"], HOJE)).toThrow(/inválido/);
  });

  it("recusa dia que não existe no calendário", () => {
    // 31 de fevereiro seria gravado calado como 03/03 — o defeito da decisão 25.
    expect(() => lerArgumentos(["--dia", "2026-02-31"], HOJE)).toThrow(
      /calendário/,
    );
    expect(() => lerArgumentos(["--dia", "2026-13-01"], HOJE)).toThrow(
      /calendário/,
    );
  });

  it("recusa formato que não seja AAAA-MM-DD", () => {
    expect(() => lerArgumentos(["--dia", "26/08/2026"], HOJE)).toThrow(
      /AAAA-MM-DD/,
    );
  });

  it("recusa dia no futuro", () => {
    // Não é capricho: o futuro sai como uma planilha de zeros bem formatada.
    expect(() => lerArgumentos(["--dia", "2026-08-28"], HOJE)).toThrow(/futuro/);
    expect(lerArgumentos(["--dia", HOJE], HOJE).dia).toBe(HOJE);
  });

  it("segura a janela dentro de 1 a 92 dias", () => {
    expect(lerArgumentos([], HOJE).janelaDias).toBe(15);
    expect(lerArgumentos(["--janela", "30"], HOJE).janelaDias).toBe(30);
    expect(() => lerArgumentos(["--janela", "0"], HOJE)).toThrow(/1 a 92/);
    expect(() => lerArgumentos(["--janela", "93"], HOJE)).toThrow(/1 a 92/);
    expect(() => lerArgumentos(["--janela", "sete"], HOJE)).toThrow(/1 a 92/);
  });

  it("o padrão é a planilha do CLIENTE, e o erro é para o lado seguro", () => {
    // O resto do sistema tem "interno" por padrão; aqui não. Este comando existe
    // para produzir o anexo que sai da empresa, e um arquivo com nome de
    // operadora já encaminhado não se desfaz.
    expect(lerArgumentos([], HOJE).publico).toBe("cliente");
    expect(lerArgumentos(["--publico", "interno"], HOJE).publico).toBe("interno");
    expect(() => lerArgumentos(["--publico", "todos"], HOJE)).toThrow(
      /cliente.*interno/,
    );
  });
});

describe("nome do arquivo", () => {
  it("tira acento, caixa e espaço", () => {
    expect(apelidoDeArquivo("REDE DROGAL")).toBe("rede-drogal");
    expect(apelidoDeArquivo("Ótica São João")).toBe("otica-sao-joao");
    expect(apelidoDeArquivo("A & B  //  C")).toBe("a-b-c");
  });

  it("nunca devolve vazio, nem para nome só de pontuação", () => {
    // Nome vazio viraria "-2026-08-26.xlsx", que é um arquivo oculto no Linux.
    expect(apelidoDeArquivo("***")).toBe("carteira");
    expect(apelidoDeArquivo("")).toBe("carteira");
  });

  it("corta nome longo sem deixar hífen pendurado", () => {
    const s = apelidoDeArquivo("A".repeat(30) + " " + "B".repeat(30));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });

  it("marca a versão interna no próprio nome", () => {
    // A que não pode ser encaminhada é a que se distingue de olho, na pasta.
    expect(nomeDoArquivo("REDE DROGAL", "2026-08-26", "cliente")).toBe(
      "rede-drogal-2026-08-26.xlsx",
    );
    expect(nomeDoArquivo("REDE DROGAL", "2026-08-26", "interno")).toBe(
      "rede-drogal-2026-08-26-interno.xlsx",
    );
  });
});

describe("o erro que uma pessoa consegue agir em cima", () => {
  const ONDE = "192.168.0.253:5432";

  it("traduz o timeout do pool para “você está fora da rede”", () => {
    // A mensagem crua do pg é "Connection terminated due to connection timeout":
    // verdadeira e inútil. Foi o que este comando devolveu na primeira execução
    // fora do escritório.
    const s = explicarErro(
      new Error("Connection terminated due to connection timeout"),
      ONDE,
    );
    expect(s).toContain(ONDE);
    expect(s).toMatch(/rede da Cobratec|VPN/);
    expect(s).toContain("Nenhum relatório foi gerado");
  });

  it("trata os códigos de rede do Node do mesmo jeito", () => {
    for (const code of ["ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ETIMEDOUT"]) {
      const e = Object.assign(new Error("connect " + code), { code });
      expect(explicarErro(e, ONDE)).toMatch(/VPN/);
    }
  });

  it("NÃO manda para a VPN quem chegou no servidor e teve a senha recusada", () => {
    // O ponto do caso: mandar essa pessoa para a rede é mandá-la passar meia
    // hora no lugar errado. O servidor respondeu.
    const e = Object.assign(
      new Error('password authentication failed for user "relatorios"'),
      { code: "28P01" },
    );
    const s = explicarErro(e, ONDE);
    expect(s).toContain("NÃO é problema de rede");
    expect(s).toContain("DB_USER");
    expect(s).not.toMatch(/VPN/);
  });

  it("separa banco inexistente de credencial errada", () => {
    const e = Object.assign(new Error('database "siscobra" does not exist'), {
      code: "3D000",
    });
    expect(explicarErro(e, ONDE)).toContain("DB_NAME");
  });

  it("diz o que fazer quando a consulta estoura o tempo no CRM", () => {
    const e = Object.assign(
      new Error("canceling statement due to statement timeout"),
      { code: "57014" },
    );
    const s = explicarErro(e, ONDE);
    expect(s).toMatch(/--janela|menos carteiras/);
    expect(s).not.toMatch(/VPN/);
  });

  it("o que não reconhece sai como veio, sem palpite", () => {
    // Diagnóstico inventado é pior que diagnóstico nenhum — manda procurar
    // defeito onde não há.
    expect(explicarErro(new Error("relation “acordo” does not exist"), ONDE)).toBe(
      "relation “acordo” does not exist",
    );
  });

  it("sobrevive a algo que não é Error", () => {
    expect(explicarErro("caiu", ONDE)).toBe("caiu");
    expect(explicarErro(null, ONDE)).toBe("null");
  });

  it("monta o endereço a partir do .env, com 5432 por padrão", () => {
    expect(ondeFicaOSiscobra({ DB_HOST: "10.0.0.9" })).toBe("10.0.0.9:5432");
    expect(ondeFicaOSiscobra({ DB_HOST: "10.0.0.9", DB_PORT: "6543" })).toBe(
      "10.0.0.9:6543",
    );
  });
});
