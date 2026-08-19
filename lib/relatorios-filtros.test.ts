// O parse do filtro múltiplo — onde um relatório mostra mais do que deveria.
//
// Sem banco: o que se testa aqui é a fronteira entre a query string (que
// qualquer pessoa edita na barra de endereços) e o array que vai para o `= ANY`
// de um banco de produção. O caso perigoso não é o erro barulhento; é a entrada
// torta tratada como "todas", que devolve a tela inteira para quem pediu uma
// carteira e não avisa ninguém.
import { describe, expect, it } from "vitest";
import { MAX_CODIGOS, codigos, paraQuery, recorteDaUrl } from "@/lib/relatorios-filtros";

describe("codigos — ausência significa todas", () => {
  it("trata ausente, vazio e os rótulos de 'todas' como sem filtro", () => {
    expect(codigos(null)).toBeNull();
    expect(codigos(undefined)).toBeNull();
    expect(codigos("")).toBeNull();
    expect(codigos("todas")).toBeNull();
    expect(codigos("todos")).toBeNull();
  });

  it("aceita as variações de caixa que a URL pode trazer", () => {
    expect(codigos("Todas")).toBeNull();
    expect(codigos("TODOS")).toBeNull();
  });
});

describe("codigos — o recorte", () => {
  it("lê um código só", () => {
    expect(codigos("12")).toEqual([12]);
  });

  it("lê a lista", () => {
    expect(codigos("12,45,88")).toEqual([12, 45, 88]);
  });

  it("normaliza ordem e repetição", () => {
    // `?carteira=45,12` e `?carteira=12,45,12` descrevem o mesmo recorte. Chegar
    // ao banco como a mesma consulta é o que dá o mesmo plano.
    expect(codigos("45,12")).toEqual([12, 45]);
    expect(codigos("12,45,12")).toEqual([12, 45]);
  });

  it("tolera o espaço que sobra de um copiar-colar", () => {
    expect(codigos(" 12 , 45 ")).toEqual([12, 45]);
  });
});

describe("codigos — entrada torta vira undefined, nunca 'todas'", () => {
  it("recusa texto", () => {
    expect(codigos("abc")).toBeUndefined();
    expect(codigos("12,abc")).toBeUndefined();
  });

  it("recusa o que o Number() aceitaria e o Siscobra não", () => {
    // Estes cinco viram número em JS e nenhum é código de carteira. É o motivo
    // de o teste ser regex e não `Number.isInteger`.
    expect(codigos("1e3")).toBeUndefined();
    expect(codigos("0x10")).toBeUndefined();
    expect(codigos("12.0")).toBeUndefined();
    expect(codigos("-12")).toBeUndefined();
    expect(codigos("+12")).toBeUndefined();
  });

  it("recusa zero, que não existe como código no CRM", () => {
    expect(codigos("0")).toBeUndefined();
    expect(codigos("12,0")).toBeUndefined();
  });

  it("recusa vírgula solta em vez de ignorá-la", () => {
    // "12,,45" quase certamente é erro de digitação. Aceitar calado devolveria
    // um recorte que a pessoa não conferiu.
    expect(codigos("12,,45")).toBeUndefined();
    expect(codigos(",")).toBeUndefined();
    expect(codigos("12,")).toBeUndefined();
  });

  it("recusa número grande demais para um código", () => {
    expect(codigos("1234567890")).toBeUndefined(); // 10 dígitos
    expect(codigos("999999999")).toEqual([999999999]); // 9 ainda passa
  });
});

describe("codigos — o teto", () => {
  it("aceita exatamente MAX_CODIGOS", () => {
    const lista = Array.from({ length: MAX_CODIGOS }, (_, i) => i + 1);
    expect(codigos(lista.join(","))).toEqual(lista);
  });

  it("recusa um a mais", () => {
    const lista = Array.from({ length: MAX_CODIGOS + 1 }, (_, i) => i + 1);
    expect(codigos(lista.join(","))).toBeUndefined();
  });

  it("conta partes, não códigos distintos", () => {
    // Repetir o mesmo código 51 vezes ainda é uma lista de 51 itens para
    // percorrer. O teto protege o servidor, não o banco.
    expect(codigos(Array(MAX_CODIGOS + 1).fill("7").join(","))).toBeUndefined();
  });
});

describe("recorteDaUrl", () => {
  it("lê os três filtros", () => {
    const p = new URLSearchParams("carteira=12,45&equipe=30&operadora=7,9");
    expect(recorteDaUrl(p)).toEqual({
      carteiras: [12, 45],
      equipes: [30],
      operadoras: [7, 9],
    });
  });

  it("ausência dos três é 'todas' nos três", () => {
    expect(recorteDaUrl(new URLSearchParams())).toEqual({
      carteiras: null,
      equipes: null,
      operadoras: null,
    });
  });

  it("um torto derruba o recorte inteiro", () => {
    // A rota responde 400. Aproveitar os dois filtros bons e ignorar o terceiro
    // devolveria uma tela que parece filtrada e não está.
    expect(recorteDaUrl(new URLSearchParams("carteira=12&equipe=abc"))).toBeNull();
    expect(recorteDaUrl(new URLSearchParams("operadora=0"))).toBeNull();
  });
});

describe("paraQuery", () => {
  it("junta por vírgula", () => {
    expect(paraQuery([12, 45])).toBe("12,45");
    expect(paraQuery(["12", "45"])).toBe("12,45");
  });

  it("vazio e nulo somem do parâmetro", () => {
    expect(paraQuery([])).toBeNull();
    expect(paraQuery(null)).toBeNull();
  });

  it("volta pelo codigos sem perder nada", () => {
    expect(codigos(paraQuery([88, 12, 45]))).toEqual([12, 45, 88]);
  });
});
