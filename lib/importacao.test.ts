// O mapa planilha → entidade, sem banco.
//
// O que se protege aqui: a conversão do que o TI digita ("Sim", "06/08/2026",
// "Administrador") e a RESOLUÇÃO DE RELAÇÃO POR NOME, que é onde a importação
// mais erra na vida real — a planilha diz "Ana Souza", não um cuid.
import { describe, expect, it } from "vitest";
import {
  booleano,
  canonizar,
  colunasDesconhecidas,
  colunasObrigatoriasFaltando,
  dataIso,
  DEFINICOES,
  ehEntidade,
  ErroDeLinha,
  indexar,
  lista,
  modeloCsv,
  papel,
  type Contexto,
} from "@/lib/importacao";
import { lerCsv } from "@/lib/csv";

const ctx: Contexto = {
  funcionarios: indexar([
    { id: "f1", nome: "Ana Souza" },
    { id: "f2", nome: "Carlos Lima" },
    { id: "f3", nome: "Bia Repetida" },
    { id: "f4", nome: "bia repetida" },
  ]),
  salas: indexar([
    { id: "s1", nome: "Sala 93 — piso superior" },
    { id: "s2", nome: "Administrativo 83" },
  ]),
};

describe("booleano", () => {
  it("aceita o que se digita numa planilha de verdade", () => {
    for (const v of ["Sim", "sim", "S", "1", "x", "TRUE", "verdadeiro"]) {
      expect(booleano(v, "ativo"), v).toBe(true);
    }
    for (const v of ["Não", "nao", "N", "0", "false", "falso", "-"]) {
      expect(booleano(v, "ativo"), v).toBe(false);
    }
  });

  it("vazio é 'não altera', não 'não'", () => {
    expect(booleano("", "ativo")).toBeUndefined();
    expect(booleano(undefined, "ativo")).toBeUndefined();
  });

  it("valor estranho é erro, não um 'não' silencioso", () => {
    // Virar `false` calado gravaria "sem headset" numa máquina que tem.
    expect(() => booleano("talvez", "headset")).toThrow(ErroDeLinha);
    expect(() => booleano("talvez", "headset")).toThrow(/headset/);
  });
});

describe("dataIso", () => {
  it("converte a data do jeito que o Brasil digita", () => {
    expect(dataIso("06/08/2026")).toBe("2026-08-06");
    expect(dataIso("6/8/2026")).toBe("2026-08-06");
    expect(dataIso("06-08-2026")).toBe("2026-08-06");
  });

  it("deixa passar o que já está em ISO", () => {
    expect(dataIso("2026-08-06")).toBe("2026-08-06");
  });

  it("vazio é undefined", () => {
    expect(dataIso("")).toBeUndefined();
  });

  it("o que não é data passa adiante para o schema reclamar", () => {
    // Quem dá a mensagem é o schema — o mesmo que a tela usa.
    expect(dataIso("ontem")).toBe("ontem");
    expect(dataIso("31/02/2026")).toBe("2026-02-31");
  });
});

describe("papel", () => {
  it("entende o português e devolve o enum", () => {
    expect(papel("Administrador")).toBe("ADMIN");
    expect(papel("admin")).toBe("ADMIN");
    expect(papel("Supervisor de sala")).toBe("SUPERVISOR");
    expect(papel("operadora")).toBe("OPERADOR");
    expect(papel("Cobrança")).toBe("COBRANCA");
    expect(papel("Operadora de cobrança")).toBe("COBRANCA");
  });

  // "Operadora" sozinha é ambígua: na Cobratec ela é a operadora de COBRANÇA,
  // mas nesta planilha o termo já valia OPERADOR antes de o papel de cobrança
  // existir. Remapear reinterpretaria em silêncio os CSVs que o TI já usa —
  // este teste está aqui para que a mudança nunca aconteça por descuido.
  it("\"operadora\" sozinha continua sendo OPERADOR, não cobrança", () => {
    expect(papel("Operadora")).toBe("OPERADOR");
    expect(papel("operador")).toBe("OPERADOR");
  });

  it("desconhecido passa adiante (o schema recusa com mensagem)", () => {
    expect(papel("chefe supremo")).toBe("chefe supremo");
  });
});

describe("lista", () => {
  it("separa por barra vertical", () => {
    expect(lista("Sala 93|Administrativo 83")).toEqual([
      "Sala 93",
      "Administrativo 83",
    ]);
  });

  it("vazio é undefined e espaços somem", () => {
    expect(lista("")).toBeUndefined();
    expect(lista(" A | B ")).toEqual(["A", "B"]);
  });
});

describe("colunas: sinônimos e obrigatórias", () => {
  it("aceita o cabeçalho que o TI provavelmente escreveu", () => {
    const { registros, chaves } = lerCsv(
      "Patrimônio;Dono;Windows;Outlook\nPAT-1;Ana Souza;Windows 11;a@b.com",
    );
    expect(colunasObrigatoriasFaltando(chaves, "computadores")).toEqual([]);
    const c = canonizar(registros[0].celulas, "computadores");
    expect(c.identificador).toBe("PAT-1");
    expect(c.funcionario).toBe("Ana Souza");
    expect(c.licencawindows).toBe("Windows 11");
    expect(c.contaoutlook).toBe("a@b.com");
  });

  it("avisa a coluna obrigatória que faltou", () => {
    const { chaves } = lerCsv("nome\nAna");
    expect(colunasObrigatoriasFaltando(chaves, "funcionarios")).toEqual(["cargo"]);
  });

  it("lista a coluna que o sistema não conhece", () => {
    const { chaves } = lerCsv("nome;cargo;signo\nAna;Operadora;Áries");
    expect(colunasDesconhecidas(chaves, "funcionarios")).toEqual(["signo"]);
  });

  it("coluna desconhecida não entra no objeto canonizado", () => {
    const { registros } = lerCsv("nome;cargo;signo\nAna;Operadora;Áries");
    const c = canonizar(registros[0].celulas, "funcionarios");
    expect(c).not.toHaveProperty("signo");
  });
});

describe("montar: relação por nome", () => {
  it("resolve funcionário e sala pelo nome", () => {
    const o = DEFINICOES.computadores.montar(
      { identificador: "PAT-1", funcionario: "Ana Souza", sala: "Administrativo 83" },
      ctx,
    );
    expect(o.funcionarioId).toBe("f1");
    expect(o.salaId).toBe("s2");
  });

  it("ignora acento e caixa ao casar o nome", () => {
    const o = DEFINICOES.computadores.montar(
      { identificador: "PAT-1", funcionario: "ANA SOUZA" },
      ctx,
    );
    expect(o.funcionarioId).toBe("f1");
  });

  it("nome que não existe diz exatamente qual", () => {
    expect(() =>
      DEFINICOES.computadores.montar(
        { identificador: "PAT-1", funcionario: "Fantasma da Ópera" },
        ctx,
      ),
    ).toThrow(/Fantasma da Ópera.*não existe/);
  });

  it("nome repetido no cadastro recusa em vez de adivinhar", () => {
    expect(() =>
      DEFINICOES.computadores.montar(
        { identificador: "PAT-1", funcionario: "Bia Repetida" },
        ctx,
      ),
    ).toThrow(/mais de um/);
  });

  it("célula em branco não vira vínculo nenhum", () => {
    const o = DEFINICOES.computadores.montar(
      { identificador: "PAT-1", funcionario: "", sala: "" },
      ctx,
    );
    expect(o.funcionarioId).toBeUndefined();
    expect(o.salaId).toBeUndefined();
  });
});

describe("montar: usuários", () => {
  it("resolve as salas do supervisor", () => {
    const o = DEFINICOES.usuarios.montar(
      {
        login: "sup",
        nome: "Sup",
        papel: "Supervisor",
        salas: "Sala 93 — piso superior|Administrativo 83",
      },
      ctx,
    );
    expect(o.papel).toBe("SUPERVISOR");
    expect(o.salaIds).toEqual(["s1", "s2"]);
  });

  it("sala em conta que não é de supervisor é engano — avisa", () => {
    expect(() =>
      DEFINICOES.usuarios.montar(
        { login: "op", nome: "Op", papel: "Operador", salas: "Sala 93 — piso superior" },
        ctx,
      ),
    ).toThrow(/só vale para papel Supervisor/);
  });
});

describe("modelo para baixar", () => {
  it("tem cabeçalho e uma linha de exemplo em todas as entidades", () => {
    for (const e of [
      "funcionarios",
      "computadores",
      "celulares",
      "deposito",
      "tipos",
      "salas",
      "usuarios",
    ] as const) {
      const csv = modeloCsv(e);
      const lido = lerCsv(csv);
      expect(lido.registros, e).toHaveLength(1);
      // O modelo tem de passar pela própria checagem de obrigatórias.
      expect(colunasObrigatoriasFaltando(lido.chaves, e), e).toEqual([]);
      expect(colunasDesconhecidas(lido.chaves, e), e).toEqual([]);
    }
  });
});

describe("ehEntidade", () => {
  it("aceita só as sete", () => {
    expect(ehEntidade("computadores")).toBe(true);
    expect(ehEntidade("chamados")).toBe(false);
    expect(ehEntidade(42)).toBe(false);
  });
});
