// A trava entre o modelo e o devedor.
//
// Este arquivo existe porque prompt é sugestão. O robô roda sem acesso ao
// Siscobra: qualquer valor que ele diga é invenção, e em cobrança valor
// inventado é CDC art. 42, é contestação, é a empresa presa a uma promessa que
// não fez. `avaliarResposta` é o que confere se o modelo obedeceu — e na dúvida
// ela ESCALA, porque atenção de operadora é barato perto disso.
import { describe, expect, it } from "vitest";
import { assuntoExigeGente, avaliarResposta } from "@/lib/chat-bot";

function resposta(texto: string, escalar = false) {
  return JSON.stringify({ resposta: texto, escalar, motivo: "" });
}

// A trava de ENTRADA, e a lição mais cara desta rodada: medindo com
// `llama3.2:1b`, "já paguei mês passado" recebeu "Não, ainda não" e "vou chamar
// meu advogado" fez o modelo inventar um telefone. Onde há risco jurídico, o
// modelo não é consultado — quem responde é gente.
describe("o que nem chega a ser perguntado ao modelo", () => {
  const paraGente: Array<[string, RegExp]> = [
    ["já paguei mês passado", /pagou/],
    ["mandei o comprovante ontem", /pagou/],
    ["vou chamar meu advogado", /jurídic/],
    ["vou no Procon", /jurídic/],
    ["quanto eu devo?", /dívida/],
    ["quero negociar", /dívida/],
    ["me manda o boleto", /dívida/],
    ["faz por pix?", /dívida/],
    ["meu cpf é 123.456.789-00", /dado pessoal/],
    ["essa dívida não é minha", /dívida/],
    ["isso é golpe", /contesta/],
    // Fato sobre a empresa também é dado que o robô não tem: medido, ele
    // inventou que a Cobratec não atende aos sábados.
    ["vocês atendem sábado?", /operacional/],
    ["qual o horário de vocês?", /operacional/],
    ["qual o endereço?", /operacional/],
  ];

  for (const [texto, motivo] of paraGente) {
    it(`"${texto}" vai direto para a fila`, () => {
      expect(assuntoExigeGente(texto)).toMatch(motivo);
    });
  }

  // Se tudo escalasse, o robô não serviria para nada — a conversa fiada é
  // exatamente o que sobra para ele.
  it("saudação e pergunta inocente seguem para o robô", () => {
    expect(assuntoExigeGente("oi")).toBeNull();
    expect(assuntoExigeGente("bom dia, tudo bem?")).toBeNull();
    expect(assuntoExigeGente("quem é vocês?")).toBeNull();
    expect(assuntoExigeGente("obrigado!")).toBeNull();
    expect(assuntoExigeGente("")).toBeNull();
  });
});

describe("o que pode chegar ao devedor", () => {
  it("saudação sem número passa", () => {
    const d = avaliarResposta(
      resposta("Olá! Aqui é a Cobratec. Como posso ajudar?"),
    );
    expect(d).toEqual({
      responder: true,
      texto: "Olá! Aqui é a Cobratec. Como posso ajudar?",
    });
  });

  it("aceita objeto já desserializado", () => {
    const d = avaliarResposta({ resposta: "Bom dia!", escalar: false });
    expect(d.responder).toBe(true);
  });
});

// Medido com llama3.2:1b: modelo pequeno devolve `{"resposta": "..."}` sem os
// outros campos com facilidade. Se ausência virasse `escalar: false`, a decisão
// MAIS PERIGOSA (falar com o devedor) seria a que acontece quando o modelo
// entende menos.
describe("contrato incompleto", () => {
  it("sem o campo escalar, escala", () => {
    const d = avaliarResposta(JSON.stringify({ resposta: "Olá! Como vai?" }));
    expect(d.responder).toBe(false);
    if (!d.responder) expect(d.motivo).toMatch(/escalar/);
  });

  it("escalar com tipo errado também escala", () => {
    expect(
      avaliarResposta({ resposta: "Olá!", escalar: "false" }).responder,
    ).toBe(false);
    expect(avaliarResposta({ resposta: "Olá!", escalar: 0 }).responder).toBe(
      false,
    );
  });
});

describe("a trava do valor", () => {
  // O caso central: o modelo diz `escalar: false` e mesmo assim inventa um
  // número no meio da frase. A conferência é sobre o TEXTO, não sobre a
  // intenção declarada.
  const inventadas = [
    "Seu débito é de R$ 1.240,00.",
    "Consigo um desconto de 40% para você.",
    "Dá para parcelar em 6x sem juros.",
    "O valor atualizado ficou 890,50.",
    "Posso gerar um boleto agora mesmo.",
    "Se preferir, mando o pix da negociação.",
    "São 300 reais no total.",
  ];

  for (const texto of inventadas) {
    it(`barra: "${texto}"`, () => {
      const d = avaliarResposta(resposta(texto));
      expect(d.responder).toBe(false);
      if (!d.responder) expect(d.motivo).toMatch(/valor/);
    });
  }

  // Falso positivo custa caro na direção contrária: escalar tudo faria o robô
  // não servir para nada. Hora e data não são valores.
  it("não confunde horário e data com dinheiro", () => {
    expect(
      avaliarResposta(resposta("Atendemos das 9h às 18h, de segunda a sexta.")),
    ).toMatchObject({ responder: true });
    expect(
      avaliarResposta(resposta("Retornamos ainda hoje, pode deixar.")),
    ).toMatchObject({ responder: true });
  });
});

describe("quando o robô desiste", () => {
  it("escalar declarado leva o motivo junto", () => {
    const d = avaliarResposta(
      JSON.stringify({
        resposta: "Vou chamar uma atendente.",
        escalar: true,
        motivo: "quer negociar",
      }),
    );
    expect(d).toEqual({ responder: false, motivo: "quer negociar" });
  });

  it("escalar sem motivo ainda escala", () => {
    const d = avaliarResposta(JSON.stringify({ resposta: "ok", escalar: true }));
    expect(d.responder).toBe(false);
  });

  // Modelo pequeno erra formato. Errar formato não pode virar silêncio.
  it("resposta fora do formato escala em vez de sumir", () => {
    expect(avaliarResposta("isto não é json").responder).toBe(false);
    expect(avaliarResposta(null).responder).toBe(false);
    expect(avaliarResposta(resposta("")).responder).toBe(false);
    expect(avaliarResposta(resposta("   ")).responder).toBe(false);
  });

  // Medido: perguntado "bom dia, tudo bem?", o 1B respondeu literalmente
  // "O que dizer" — o rótulo do campo JSON devolvido como se fosse fala.
  it("rótulo do formulário devolvido como resposta é barrado", () => {
    expect(avaliarResposta(resposta("O que dizer")).responder).toBe(false);
    expect(avaliarResposta(resposta("por que escalou")).responder).toBe(false);
    // Mas cumprimento curto de verdade passa.
    expect(avaliarResposta(resposta("Oi!")).responder).toBe(true);
  });

  // Medido: "vou chamar meu advogado" fez o 1B responder com um telefone
  // inventado. O robô não tem agenda nenhuma.
  it("telefone inventado escala", () => {
    const d = avaliarResposta(
      resposta("Ligue para o seu advogado no 11 9817-8484."),
    );
    expect(d.responder).toBe(false);
    if (!d.responder) expect(d.motivo).toMatch(/telefone/);
  });

  // Medido: o 1B prometeu atendente e marcou escalar=false. A pessoa esperaria
  // para sempre por alguém que nunca foi chamado.
  it("prometer atendente sem escalar é barrado", () => {
    const d = avaliarResposta(
      resposta("Vou chamar uma atendente para ver isso com você."),
    );
    expect(d.responder).toBe(false);
    if (!d.responder) expect(d.motivo).toMatch(/prometeu atendente/);
  });

  // Quanto mais texto sem dado, mais chance de o modelo preencher o vazio.
  it("discurso longo escala", () => {
    const d = avaliarResposta(resposta("a".repeat(700)));
    expect(d.responder).toBe(false);
    if (!d.responder) expect(d.motivo).toMatch(/estendeu/);
  });
});
