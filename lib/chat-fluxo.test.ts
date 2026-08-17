// A conversa do robô, turno a turno.
//
// O que se protege aqui, em ordem de gravidade:
//   1. valor não sai antes de documento **e** nome do titular conferidos;
//   2. nenhuma condição fora da regra oficial da carteira chega ao devedor;
//   3. o robô conversa mais, mas para onde tem de parar;
//   4. banco fora do ar vira gente, nunca silêncio nem palpite.
import { describe, expect, it } from "vitest";
import { decidir, type Acao, type EstadoConversa, type Fontes } from "@/lib/chat-fluxo";
import { lerSaidaDoModelo, extrairDados } from "@/lib/chat-intencao";
import { montarOferta, reais } from "@/lib/chat-respostas";
import type { Identificacao } from "@/lib/siscobra";

const CPF = "52998224725"; // válido nos dígitos verificadores
const NOME = "Maria Aparecida Souza";

const NOVO: EstadoConversa = {
  devcod: null, carcod: null, identificadaEm: null, nome: null,
  saldo: null, vencidoDesde: null,
  saudacoes: 0, documentoPendente: null, nomePendente: null, oferta: null,
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

// Robô caído não pode ser confundido com devedor falando coisa estranha.
// Aconteceu de verdade: a sessão do Colab caiu, "olá" foi para a fila, e o
// motivo dizia "assunto fora do que o robô atende" — a operadora procuraria o
// problema na fala do devedor enquanto o modelo estava morto.
describe("modelo fora do ar", () => {
  it("escala com o motivo certo, e não com o genérico", async () => {
    const semResposta = { ...ler("outro", "olá"), respondeu: false };
    const a = await decidir(semResposta, NOVO, fontes());
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") {
      expect(a.motivo).toMatch(/fora do ar/);
      expect(a.motivo).not.toMatch(/assunto fora do que o robô atende/);
    }
  });

  // Para o devedor não muda nada: a infraestrutura da empresa não é problema dele.
  it("o devedor lê o mesmo aviso de sempre", async () => {
    const caido = await decidir({ ...ler("outro", "olá"), respondeu: false }, NOVO, fontes());
    const normal = await decidir(ler("outro", "quanto custa uma pizza"), NOVO, fontes());
    if (caido.tipo === "escalar" && normal.tipo === "escalar") {
      expect(caido.aviso).toBe(normal.aviso);
      expect(caido.motivo).not.toBe(normal.motivo);
    }
  });

  // Uma saudação que o modelo classificou é conversa normal, não falha.
  it("modelo que respondeu segue o fluxo", async () => {
    const a = await decidir(ler("saudacao", "olá"), NOVO, fontes());
    expect(a.tipo).toBe("responder");
  });
});

// O eco: "olá" e "boa tarde" seguidos devolviam a MESMA frase, palavra por
// palavra. Foi o que o primeiro atendimento de verdade mostrou.
describe("cumprimento repetido não vira eco", () => {
  it("a primeira saudação responde e ANOTA que já cumprimentou", async () => {
    const a = await decidir(ler("saudacao", "olá"), NOVO, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toMatch(/tudo bem\?/i);
      expect(a.estado?.saudacoes).toBe(1);
    }
  });

  it("a segunda saudação responde DIFERENTE", async () => {
    const primeira = await decidir(ler("saudacao", "olá"), NOVO, fontes());
    const segunda = await decidir(
      ler("saudacao", "boa tarde"),
      { ...NOVO, saudacoes: 1 },
      fontes(),
    );
    expect(segunda.tipo).toBe("responder");
    if (primeira.tipo === "responder" && segunda.tipo === "responder") {
      expect(segunda.texto).not.toBe(primeira.texto);
      expect(segunda.estado?.saudacoes).toBe(2);
    }
  });

  // Uma terceira frase inventada seria o mesmo defeito com outra roupa.
  it("o terceiro cumprimento sem pedido chama gente", async () => {
    const a = await decidir(
      ler("saudacao", "oi?"),
      { ...NOVO, saudacoes: 2 },
      fontes(),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/cumprimento/i);
  });
});

describe("valor não sai sem identificação", () => {
  for (const intencao of ["consultar_saldo", "quer_negociar", "quer_boleto"]) {
    it(`"${intencao}" sem identificação pede o documento, não revela nada`, async () => {
      const a = await decidir(ler(intencao), NOVO, fontes());
      expect(a.tipo).toBe("responder");
      if (a.tipo === "responder") {
        expect(a.texto).toMatch(/CPF|CNPJ/i);
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

  it("documento sozinho não identifica — pede o nome e guarda o que veio", async () => {
    const a = await decidir(ler("identificar", `meu cpf é ${CPF}`), NOVO, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toMatch(/nome completo/i);
      expect(a.estado?.documentoPendente).toBe(CPF);
    }
  });

  // O defeito que o segundo fator novo trouxe, e que a data não tinha:
  // "12/04/1985" só pode ser uma data; "bom dia, tudo bem" parece um nome. Sem a
  // trava de contexto, quem cumprimentava ouvia "recebi o nome, agora o CPF".
  it("frase comum NÃO é lida como nome — só conta quando o robô espera um", async () => {
    const a = await decidir(ler("saudacao", "bom dia, tudo bem"), NOVO, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toMatch(/Cobratec/);
      expect(a.texto).not.toMatch(/CPF|CNPJ/i);
      expect(a.estado?.nomePendente).toBeUndefined();
    }
  });

  it("com documento pendente, a frase seguinte VALE como nome", async () => {
    const a = await decidir(
      // Intenção de saudação de propósito: quem responde o nome pedido raramente
      // é classificado como "identificar". Quem autoriza aqui é o documento
      // pendente, não o rótulo do modelo.
      ler("saudacao", NOME),
      { ...NOVO, documentoPendente: CPF },
      fontes(),
    );
    // Identificou: o contexto (documento pendente) autorizou ler aquilo como nome.
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") expect(a.estado?.identificadaEm).toBeInstanceOf(Date);
  });

  it("o nome chegando depois, junta com o documento guardado e identifica", async () => {
    const a = await decidir(
      ler("identificar", NOME),
      { ...NOVO, documentoPendente: CPF },
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
      ler("identificar", `${CPF} ${NOME}`),
      NOVO,
      fontes({ identificar: async () => ({ achou: [], erro: false }) }),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") expect(a.motivo).toMatch(/não localizado/);
  });

  // Escolher uma carteira seria falar do contrato errado.
  it("mais de uma carteira não é escolhida pelo robô", async () => {
    const a = await decidir(
      ler("identificar", `${CPF} ${NOME}`),
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
      ler("identificar", `${CPF} ${NOME}`),
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
      // A oferta é GRAVADA, não só marcada: a operadora precisa ler o que foi
      // prometido ao assumir, senão contradiz o robô na frente do devedor.
      expect(a.estado?.oferta).toMatchObject({
        parcelas: 6,
        valorParcela: 206.67,
        descontoPercentual: 30,
      });
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
    const a = await decidir(
      ler("aceita"),
      {
        ...IDENTIFICADA,
        oferta: {
          parcelas: 6, valorParcela: 206.67, descontoPercentual: 30,
          valorAVista: 868, em: new Date().toISOString(),
        },
      },
      fontes(),
    );
    expect(a.tipo).toBe("escalar");
    if (a.tipo === "escalar") {
      expect(a.motivo).toMatch(/aceitou/);
      expect(a.aviso).toMatch(/atendente/i);
    }
  });
});

// O ganho que o desenho de molde trouxe de volta: perguntas que precisavam ir
// para gente porque o modelo inventava agora são string fixa.
describe("perguntas que voltaram a ser do robô", () => {
  it("o que a empresa faz é respondido, e com a verdade", async () => {
    const a = await decidir(ler("sobre_empresa"), NOVO, fontes());
    expect(a.tipo).toBe("responder");
    if (a.tipo === "responder") {
      expect(a.texto).toMatch(/empresa de cobrança/i);
      expect(a.texto).not.toMatch(/tecnologia|Receita Federal/i);
    }
  });

  // E sem exigir identificação: dizer o que a empresa faz não é dado de
  // ninguém, então pedir CPF antes seria hostil à toa.
  it("não pede documento para dizer o que a empresa é", async () => {
    const a = await decidir(ler("sobre_empresa"), NOVO, fontes());
    if (a.tipo === "responder") expect(a.texto).not.toMatch(/CPF|CNPJ/i);
  });
});

// A regra que virou tipo: escalonamento mudo não compila mais. Este teste é a
// prova de que ela vale em EXECUÇÃO também — o tipo garante que o campo existe,
// não que ele tenha conteúdo.
describe("ninguém é deixado falando sozinho", () => {
  const cenarios: Array<[string, () => Promise<Acao>]> = [
    ["banco fora do ar", () =>
      decidir(ler("identificar", `${CPF} ${NOME}`), NOVO,
        fontes({ identificar: async () => ({ achou: [], erro: true }) }))],
    ["cadastro não encontrado", () =>
      decidir(ler("identificar", `${CPF} ${NOME}`), NOVO,
        fontes({ identificar: async () => ({ achou: [], erro: false }) }))],
    ["carteira sem regra", () =>
      decidir(ler("quer_negociar"), IDENTIFICADA,
        fontes({ regraDaCarteira: async () => null }))],
    ["aceitou sem proposta", () => decidir(ler("aceita"), IDENTIFICADA, fontes())],
    ["pediu boleto", () => decidir(ler("quer_boleto"), IDENTIFICADA, fontes())],
    ["assunto que ele não trata", () => decidir(ler("outro"), IDENTIFICADA, fontes())],
    ["contestação", () => decidir(ler("contesta"), IDENTIFICADA, fontes())],
  ];

  for (const [nome, executar] of cenarios) {
    it(`${nome}: o devedor recebe uma resposta antes de virar fila`, async () => {
      const a = await executar();
      expect(a.tipo).toBe("escalar");
      if (a.tipo === "escalar") {
        expect(a.aviso.trim().length).toBeGreaterThan(10);
        // E o aviso não pode vazar o motivo interno: "sem saldo em aberto" e
        // "carteira sem regra de acordo" são vocabulário nosso, não dela.
        expect(a.aviso).not.toMatch(/carteira|saldo em aberto|regra de acordo/i);
      }
    });
  }
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
      `{"intencao":"identificar","documento":"00000000000"}`,
      `anota aí ${CPF}`,
    );
    expect(l.documento).toBe(CPF);
  });
});

// A validação de documento e a conferência do nome moram em
// `lib/identificacao.ts` e são testadas lá, uma a uma. O que interessa aqui é
// só a ponte: `extrairDados` entrega ao fluxo o que a pessoa escreveu.
describe("o que o fluxo recorta da mensagem", () => {
  it("acha documento e nome no meio da frase", () => {
    const d = extrairDados(`oi, sou Maria Aparecida Souza, cpf ${CPF}`);
    expect(d.documento).toBe(CPF);
    expect(d.nome).toBe("MARIA APARECIDA SOUZA");
  });

  it("CNPJ também é documento", () => {
    const d = extrairDados("cnpj 11.222.333/0001-81, Droga Sim Comercial");
    expect(d.documento).toBe("11222333000181");
  });

  it("primeiro nome sozinho não vira nome — o robô vai pedir o completo", () => {
    expect(extrairDados(`${CPF} Maria`).nome).toBeNull();
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
