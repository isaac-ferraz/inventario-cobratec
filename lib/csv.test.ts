// O parser de CSV contra o que o Excel realmente produz.
import { describe, expect, it } from "vitest";
import {
  analisarCsv,
  detectarDelimitador,
  gerarCsv,
  lerCsv,
  normalizarCabecalho,
  semAcentos,
} from "@/lib/csv";

describe("semAcentos", () => {
  it("tira acento e caixa mas preserva pontuação", () => {
    expect(semAcentos("Não")).toBe("nao");
    expect(semAcentos("SIM")).toBe("sim");
    // O "-" é o que o TI escreve para "não": some em normalizarCabecalho, mas
    // aqui tem de sobreviver.
    expect(semAcentos("-")).toBe("-");
    expect(semAcentos("Memória RAM")).toBe("memoria ram");
  });
});

describe("normalizarCabecalho", () => {
  it("tira acento, espaço, maiúscula e pontuação", () => {
    expect(normalizarCabecalho("Funcionário")).toBe("funcionario");
    expect(normalizarCabecalho("  QUANTIDADE MÍNIMA ")).toBe("quantidademinima");
    expect(normalizarCabecalho("Licença Windows")).toBe("licencawindows");
    expect(normalizarCabecalho("Nº de série")).toBe("ndeserie");
    expect(normalizarCabecalho("data_aquisicao")).toBe("dataaquisicao");
  });

  it("iguala variações que o TI digitaria da mesma coluna", () => {
    const iguais = ["Sala", "sala", "SALA", " sala "];
    expect(new Set(iguais.map(normalizarCabecalho)).size).toBe(1);
  });
});

describe("detectarDelimitador", () => {
  it("acha o ; do Excel em pt-BR", () => {
    expect(detectarDelimitador("nome;cargo;sala\nAna;Operadora;93")).toBe(";");
  });

  it("acha a vírgula quando é ela", () => {
    expect(detectarDelimitador("nome,cargo\nAna,Operadora")).toBe(",");
  });

  it("não se confunde com vírgulas dentro de campo entre aspas", () => {
    const csv = 'nome;observacoes\nAna;"mouse, teclado, headset"';
    expect(detectarDelimitador(csv)).toBe(";");
  });

  it("conta só o cabeçalho, não o arquivo todo", () => {
    // O corpo tem muitas vírgulas; as colunas são separadas por ;
    const csv = 'nome;obs\nAna;"a,b,c,d,e,f,g,h"\nBia;"i,j,k,l,m,n,o,p"';
    expect(detectarDelimitador(csv)).toBe(";");
  });

  it("uma coluna só não quebra", () => {
    expect(detectarDelimitador("nome\nMemória RAM")).toBe(";");
  });
});

describe("analisarCsv", () => {
  it("lê CRLF e ignora linha vazia", () => {
    const m = analisarCsv("a;b\r\n1;2\r\n\r\n3;4\r\n");
    expect(m).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("respeita delimitador dentro de aspas", () => {
    const m = analisarCsv('nome;obs\nAna;"cabo; mouse"');
    expect(m[1]).toEqual(["Ana", "cabo; mouse"]);
  });

  it("aspas duplicadas viram uma aspa literal", () => {
    const m = analisarCsv('nome;obs\nAna;"o ""grande"" monitor"');
    expect(m[1][1]).toBe('o "grande" monitor');
  });

  it("aceita quebra de linha dentro do campo", () => {
    const m = analisarCsv('nome;obs\nAna;"linha 1\nlinha 2"');
    expect(m).toHaveLength(2);
    expect(m[1][1]).toBe("linha 1\nlinha 2");
  });

  it("engole o BOM do Excel em vez de colar no 1º cabeçalho", () => {
    const m = analisarCsv("﻿nome;cargo\nAna;Operadora");
    expect(m[0][0]).toBe("nome");
  });

  it("última linha sem quebra final entra", () => {
    const m = analisarCsv("a;b\n1;2");
    expect(m).toHaveLength(2);
  });
});

describe("lerCsv", () => {
  it("devolve registros por chave normalizada com o nº da linha do arquivo", () => {
    const r = lerCsv("Nome;Cargo\nAna Souza;Operadora\nBia;Gestora");
    expect(r.chaves).toEqual(["nome", "cargo"]);
    expect(r.registros[0]).toEqual({
      linha: 2,
      celulas: { nome: "Ana Souza", cargo: "Operadora" },
    });
    // A segunda linha de dados é a linha 3 do arquivo — é o que a mensagem de
    // erro precisa dizer para a pessoa achar a linha na planilha.
    expect(r.registros[1].linha).toBe(3);
  });

  it("linha mais curta que o cabeçalho vira célula vazia", () => {
    const r = lerCsv("nome;cargo;sala\nAna;Operadora");
    expect(r.registros[0].celulas).toEqual({
      nome: "Ana",
      cargo: "Operadora",
      sala: "",
    });
  });

  it("apara espaço das células e do cabeçalho", () => {
    const r = lerCsv(" Nome ; Cargo \n  Ana  ;  Operadora  ");
    expect(r.registros[0].celulas.nome).toBe("Ana");
    expect(r.cabecalho).toEqual(["Nome", "Cargo"]);
  });

  it("arquivo vazio não explode", () => {
    expect(lerCsv("").registros).toEqual([]);
    expect(lerCsv("\n\n").registros).toEqual([]);
  });

  it("coluna sem nome no cabeçalho é ignorada", () => {
    const r = lerCsv("nome;;cargo\nAna;lixo;Operadora");
    expect(Object.keys(r.registros[0].celulas)).toEqual(["nome", "cargo"]);
  });
});

describe("gerarCsv", () => {
  it("usa ; e CRLF para o Excel abrir direto", () => {
    expect(gerarCsv(["a", "b"], [["1", "2"]])).toBe("a;b\r\n1;2");
  });

  it("põe aspas quando a célula tem ; aspas ou quebra", () => {
    expect(gerarCsv(["a"], [['x;y']])).toBe('a\r\n"x;y"');
    expect(gerarCsv(["a"], [['diz "oi"']])).toBe('a\r\n"diz ""oi"""');
  });

  it("o que ele escreve, o parser lê de volta igual", () => {
    const cabecalho = ["nome", "observacoes"];
    const linhas = [["Ana", 'cabo; mouse e "coisas"'], ["Bia", "linha 1\nlinha 2"]];
    const lido = analisarCsv(gerarCsv(cabecalho, linhas));
    expect(lido).toEqual([cabecalho, ...linhas]);
  });
});
