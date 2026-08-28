import { describe, expect, it } from "vitest";
import {
  montarEmail,
  tituloCarteiras,
  dinheiro,
  type ResumoDiario,
} from "@/lib/relatorio-email";

// O que se testa aqui é o que o CLIENTE lê. O e-mail é montado por código
// justamente para o número não passar por um modelo (ver o cabeçalho do
// módulo), e um teste é o que sustenta essa promessa quando alguém mexer no
// texto daqui a seis meses.

function resumo(over: Partial<ResumoDiario> = {}): ResumoDiario {
  return {
    carteiras: [{ cod: 1163, nome: "REDE DROGAL", ativa: true }],
    dia: "2026-08-26",
    hoje: "2026-08-27",
    janela: { inicio: "2026-08-27", fim: "2026-09-10", dias: 15 },
    vazio: false,
    avisos: [],
    dia_numeros: {
      acordos: { qtd: 3, valor: 1234.5 },
      acionamentos: { qtd: 40, devedores: 31 },
      honorarios: { qtd: 2, valor: 88.9, recebido: 500, conferida: false },
    },
    mes: {
      inicio: "2026-08-01",
      fim: "2026-08-26",
      acordos: { qtd: 12, valor: 9876.54 },
    },
    base: { fichas: 5, contratos: 5, saldo: 3461.46, cadastrados: 103 },
    carteira_acordos: {
      aVencer: { qtd: 2, valor: 300 },
      venceHoje: { qtd: 1, valor: 100 },
      atraso: { qtd: 4, valor: 900, desde: "2026-02-28" },
      quebras: { qtd: 1, valor: 674.54 },
      primeiraParcela: { avaliados: 10, pagos: 7 },
    },
    ...over,
  };
}

describe("e-mail do relatório diário", () => {
  it("põe carteira e dia no assunto, em português", () => {
    const { assunto } = montarEmail(resumo());
    expect(assunto).toBe("REDE DROGAL — relatório diário de 26/08/2026");
  });

  it("formata dinheiro em real, com vírgula decimal", () => {
    // "R$ 3461.46" num e-mail de cliente é erro de leitura garantido.
    expect(dinheiro(3461.46)).toContain("3.461,46");
    const { texto } = montarEmail(resumo());
    expect(texto).toContain("R$ 3.461,46");
    expect(texto).not.toContain("3461.46");
  });

  it("separa ficha de devedor cadastrado — são dois números diferentes", () => {
    const { texto } = montarEmail(resumo());
    expect(texto).toContain("Fichas com saldo em aberto: 5");
    expect(texto).toContain("Devedores cadastrados (com ou sem saldo): 103");
  });

  it("diz por extenso quando o dia não teve movimento", () => {
    // Zero calado se lê como defeito de apuração. Esta frase é o motivo de
    // `vazio` existir no JSON.
    const { texto, html } = montarEmail(resumo({ vazio: true }));
    expect(texto).toContain("não houve movimento registrado nesta carteira");
    expect(texto).toContain("não por falha na apuração");
    expect(html).toContain("não houve movimento registrado");
  });

  it("e não diz isso quando houve movimento", () => {
    const { texto } = montarEmail(resumo());
    expect(texto).not.toContain("não houve movimento");
  });

  it("cola a ressalva do honorário ao número do honorário", () => {
    const { texto } = montarEmail(resumo());
    expect(texto).toContain("Honorários apurados");
    expect(texto).toContain("não foram conferidos contra o relatório oficial");
  });

  it("sem honorário no e-mail, sem ressalva de honorário", () => {
    // Ressalva sobre número ausente é ruído — e ruído ensina a pular as outras.
    const r = resumo();
    r.dia_numeros.honorarios = null;
    const { texto } = montarEmail(r);
    expect(texto).not.toContain("Honorários apurados");
    expect(texto).not.toContain("relatório oficial de comissão");
  });

  it("as duas ressalvas de sempre vão em todo e-mail", () => {
    const r = resumo();
    r.dia_numeros.honorarios = null;
    const { texto } = montarEmail(r);
    expect(texto).toContain("não é o mesmo que afirmar que o devedor não pagou");
    expect(texto).toContain("o retorno automático do discador fica de fora");
  });

  it("carrega o aviso da carteira inativa para dentro do e-mail", () => {
    const { texto, html } = montarEmail(
      resumo({ avisos: ["A carteira 1163 está INATIVA no Siscobra."] }),
    );
    expect(texto).toContain("Atenção: A carteira 1163 está INATIVA");
    expect(html).toContain("INATIVA");
  });

  it("escapa o que veio do banco antes de virar HTML", () => {
    // Nome de carteira sai de uma tabela do CRM; um `&` solto quebra o HTML e um
    // `<` faria pior.
    const { html } = montarEmail(
      resumo({ carteiras: [{ cod: 9, nome: "A & B <TESTE>", ativa: true }] }),
    );
    expect(html).toContain("A &amp; B &lt;TESTE&gt;");
    expect(html).not.toContain("<TESTE>");
  });

  it("resume o título quando há mais de uma carteira", () => {
    expect(tituloCarteiras([{ nome: "A" }])).toBe("A");
    expect(tituloCarteiras([{ nome: "A" }, { nome: "B" }])).toBe(
      "A e mais 1 carteira",
    );
    expect(tituloCarteiras([{ nome: "A" }, { nome: "B" }, { nome: "C" }])).toBe(
      "A e mais 2 carteiras",
    );
  });
});
