import { describe, expect, it } from "vitest";
import {
  alcancaConversas,
  estaAberta,
  estaIdentificada,
  formatarTelefone,
  normalizarTelefone,
  podeFalar,
  podeMudarSituacao,
  podeRevelarValores,
  propostaCabeNaRegra,
  SITUACOES,
  ROTULO_SITUACAO,
  type RegraCarteira,
} from "@/lib/conversas";

describe("alcance das conversas", () => {
  it("admin e cobrança entram", () => {
    expect(alcancaConversas("ADMIN")).toBe(true);
    expect(alcancaConversas("COBRANCA")).toBe(true);
  });

  // A parte que mais importa: o supervisor de sala responde pelo INVENTÁRIO de
  // uma sala, e conversa com devedor não pertence a sala nenhuma (decisão 27).
  it("supervisor de sala NÃO entra", () => {
    expect(alcancaConversas("SUPERVISOR")).toBe(false);
  });

  it("operador de helpdesk não entra", () => {
    expect(alcancaConversas("OPERADOR")).toBe(false);
  });
});

describe("quem pode responder ao devedor", () => {
  it("a operadora que assumiu responde", () => {
    expect(podeFalar("COBRANCA", "humana", "u-1", "u-1").permitido).toBe(true);
  });

  it("outra operadora não entra na conversa alheia", () => {
    const r = podeFalar("COBRANCA", "humana", "u-1", "u-2");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/outra atendente/);
  });

  it("admin fala em qualquer uma", () => {
    expect(podeFalar("ADMIN", "humana", "u-1", "u-admin").permitido).toBe(true);
  });

  it("ninguém escreve por cima do robô sem assumir", () => {
    const r = podeFalar("ADMIN", "bot", null, "u-admin");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/Assuma a conversa/);
  });

  it("conversa encerrada não recebe mensagem", () => {
    const r = podeFalar("ADMIN", "encerrada", "u-1", "u-1");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/encerrada/);
  });
});

describe("transições de situação", () => {
  it("robô escala para a fila e a fila vira atendimento", () => {
    expect(podeMudarSituacao("bot", "fila").permitido).toBe(true);
    expect(podeMudarSituacao("fila", "humana").permitido).toBe(true);
  });

  it("o robô pode ser pulado: bot vai direto para humana", () => {
    expect(podeMudarSituacao("bot", "humana").permitido).toBe(true);
  });

  // A regra mais importante da tabela.
  it("NÃO devolve ao robô o que já teve atendimento humano", () => {
    const r = podeMudarSituacao("humana", "bot");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/encerre em vez disso/);
  });

  it("da fila também não volta para o robô", () => {
    expect(podeMudarSituacao("fila", "bot").permitido).toBe(false);
  });

  it("atendente pode devolver para a fila", () => {
    expect(podeMudarSituacao("humana", "fila").permitido).toBe(true);
  });

  it("encerrada é terminal pela tela", () => {
    const r = podeMudarSituacao("encerrada", "humana");
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/escrever de novo/);
  });

  it("situação inválida é recusada", () => {
    expect(podeMudarSituacao("bot", "resolvido").permitido).toBe(false);
    expect(podeMudarSituacao("qualquer", "fila").permitido).toBe(false);
  });

  it("ficar onde está é sempre permitido", () => {
    for (const s of SITUACOES) {
      expect(podeMudarSituacao(s, s).permitido).toBe(true);
    }
  });

  it("toda situação tem rótulo para a tela", () => {
    for (const s of SITUACOES) expect(ROTULO_SITUACAO[s]).toBeTruthy();
  });

  it("abertas são as três que pedem alguma coisa", () => {
    expect(estaAberta("bot")).toBe(true);
    expect(estaAberta("fila")).toBe(true);
    expect(estaAberta("humana")).toBe(true);
    expect(estaAberta("encerrada")).toBe(false);
  });
});

// A trava central: nenhum valor sai antes de o devedor provar quem é.
describe("identificação antes de valor", () => {
  const em = new Date("2026-08-11T12:00:00Z");

  it("código + data de verificação = identificada", () => {
    const c = { siscobraDevcod: 999, identificadaEm: em };
    expect(estaIdentificada(c)).toBe(true);
    expect(podeRevelarValores(c)).toBe(true);
  });

  // Palpite do n8n (telefone que casou com um cadastro) NÃO é identificação.
  it("código sozinho não basta — palpite não é prova", () => {
    const c = { siscobraDevcod: 999, identificadaEm: null };
    expect(estaIdentificada(c)).toBe(false);
    expect(podeRevelarValores(c)).toBe(false);
  });

  it("sem código nenhum, valor nenhum", () => {
    expect(podeRevelarValores({ siscobraDevcod: null, identificadaEm: null })).toBe(
      false,
    );
    expect(podeRevelarValores({ siscobraDevcod: null, identificadaEm: em })).toBe(
      false,
    );
  });
});

describe("proposta dentro da regra oficial da carteira", () => {
  const regra: RegraCarteira = {
    maxParcelas: 6,
    valorMinimoParcela: 100,
    descontoMaximoPercentual: 40,
  };

  it("dentro de tudo, passa", () => {
    const r = propostaCabeNaRegra(
      { parcelas: 6, valorParcela: 100, descontoPercentual: 40 },
      regra,
    );
    expect(r.permitido).toBe(true);
  });

  it("parcela demais é recusada com o teto na mensagem", () => {
    const r = propostaCabeNaRegra(
      { parcelas: 7, valorParcela: 200, descontoPercentual: 10 },
      regra,
    );
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/até 6 parcelas/);
  });

  it("parcela abaixo do piso é recusada", () => {
    const r = propostaCabeNaRegra(
      { parcelas: 3, valorParcela: 99.99, descontoPercentual: 0 },
      regra,
    );
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/parcela mínima/);
  });

  it("desconto acima do teto é recusado", () => {
    const r = propostaCabeNaRegra(
      { parcelas: 2, valorParcela: 500, descontoPercentual: 41 },
      regra,
    );
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/desconto máximo/);
  });

  // A maioria das carteiras não tem regra ativa (só ~20, pelo mapa do schema).
  // Sem documento oficial o robô não inventa condição nenhuma.
  it("carteira SEM regra cadastrada não fecha nada", () => {
    const r = propostaCabeNaRegra(
      { parcelas: 1, valorParcela: 1000, descontoPercentual: 0 },
      null,
    );
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toMatch(/não tem regra/);
  });

  it("limite nulo não trava aquele eixo", () => {
    const solta: RegraCarteira = {
      maxParcelas: null,
      valorMinimoParcela: null,
      descontoMaximoPercentual: null,
    };
    const r = propostaCabeNaRegra(
      { parcelas: 60, valorParcela: 1, descontoPercentual: 99 },
      solta,
    );
    expect(r.permitido).toBe(true);
  });

  it("proposta sem parcela é recusada", () => {
    expect(
      propostaCabeNaRegra(
        { parcelas: 0, valorParcela: 100, descontoPercentual: 0 },
        regra,
      ).permitido,
    ).toBe(false);
  });
});

describe("telefone é a identidade da conversa", () => {
  it("as variações do mesmo número viram a mesma chave", () => {
    const esperado = "5512997654321";
    expect(normalizarTelefone("+55 (12) 99765-4321")).toBe(esperado);
    expect(normalizarTelefone("5512997654321")).toBe(esperado);
    expect(normalizarTelefone("12997654321")).toBe(esperado);
    expect(normalizarTelefone("(12) 99765-4321")).toBe(esperado);
  });

  it("fixo com DDD também ganha o 55", () => {
    expect(normalizarTelefone("1239321234")).toBe("551239321234");
  });

  // Não inventar nem tirar o nono dígito: adivinhar juntaria conversas de
  // números diferentes, que é pior do que ter duas do mesmo.
  it("não inventa o nono dígito", () => {
    expect(normalizarTelefone("12997654321")).not.toBe(
      normalizarTelefone("1239321234"),
    );
  });

  it("lixo e número curto demais viram null", () => {
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("abc")).toBeNull();
    expect(normalizarTelefone("99999")).toBeNull();
  });

  it("formata para a tela e volta legível", () => {
    expect(formatarTelefone("5512997654321")).toBe("(12) 99765-4321");
    expect(formatarTelefone("551239321234")).toBe("(12) 3932-1234");
  });

  it("número já com código de país passa inteiro, mesmo não sendo do Brasil", () => {
    expect(normalizarTelefone("+351 912 345 678")).toBe("351912345678");
    expect(formatarTelefone("351912345678")).toBe("351912345678");
  });

  // O limite assumido, escrito como teste para ninguém "consertar" sem saber o
  // que perde: 11 dígitos é brasileiro por decisão, não por certeza. Um número
  // americano digitado à mão sairia com 55 na frente — e tudo bem, porque o
  // número que importa vem do gateway já em E.164 (a asserção acima).
  it("11 dígitos é assumido brasileiro — limite conhecido", () => {
    expect(normalizarTelefone("14155552671")).toBe("5514155552671");
  });
});
