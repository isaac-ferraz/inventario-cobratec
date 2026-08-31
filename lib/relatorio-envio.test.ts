import { describe, expect, it } from "vitest";
import {
  configEmail,
  explicarErroEmail,
  ondeFicaOSmtp,
  type ConfigEmail,
} from "@/lib/relatorio-envio";

// O comando roda sozinho, de manhã, disparado por um agente, sem ninguém
// olhando — e agora ele MANDA e-mail. Cada caso abaixo é uma frase que o
// arquivo afirma em comentário e que sem teste ninguém confere.

const MINIMO = { SMTP_USER: "eu@gmail.com", SMTP_PASSWORD: "abcd efgh ijkl mnop" };

describe("configEmail", () => {
  it("sem nada configurado, devolve null — não é erro", () => {
    // Máquina de teste sem SMTP ainda serve para gerar a planilha.
    expect(configEmail({})).toBeNull();
  });

  it("configurado PELA METADE estoura, e diz qual metade falta", () => {
    // É o coração desta decisão: tratar meia config como "e-mail desligado"
    // faria a planilha sair no disco todo dia, calada, com a caixa vazia.
    expect(() => configEmail({ SMTP_USER: "eu@gmail.com" })).toThrow(
      /SMTP_PASSWORD/,
    );
    expect(() => configEmail({ SMTP_PASSWORD: "x" })).toThrow(/SMTP_USER/);
  });

  it("o destino padrão é a PRÓPRIA conta", () => {
    // A garantia que substitui o rascunho da decisão 42: o relatório volta para
    // quem pediu, e quem encaminha ao cliente é gente.
    expect(configEmail(MINIMO)?.para).toEqual(["eu@gmail.com"]);
    expect(configEmail(MINIMO)?.de).toBe("eu@gmail.com");
  });

  it("aceita vários destinos por vírgula, e ignora espaço sobrando", () => {
    const c = configEmail({
      ...MINIMO,
      RELATORIO_EMAIL_PARA: " a@b.com , c@d.com ",
    });
    expect(c?.para).toEqual(["a@b.com", "c@d.com"]);
  });

  it("recusa endereço sem arroba em vez de mandar para o nada", () => {
    expect(() =>
      configEmail({ ...MINIMO, RELATORIO_EMAIL_PARA: "isaac" }),
    ).toThrow(/inválido/);
    expect(() => configEmail({ ...MINIMO, RELATORIO_EMAIL_DE: "eu" })).toThrow(
      /inválido/,
    );
  });

  it("a vírgula sobrando no fim não vira destinatário vazio", () => {
    expect(configEmail({ ...MINIMO, RELATORIO_EMAIL_PARA: "a@b.com," })?.para).toEqual(
      ["a@b.com"],
    );
  });

  it("465 é TLS direto; 587 é STARTTLS", () => {
    // Trocar isso faz o envio travar até o timeout, sem mensagem útil.
    expect(configEmail(MINIMO)?.seguro).toBe(true);
    expect(configEmail({ ...MINIMO, SMTP_PORT: "587" })?.seguro).toBe(false);
  });

  it("o padrão do bloco SMTP é o Gmail", () => {
    expect(configEmail(MINIMO)?.host).toBe("smtp.gmail.com");
    expect(configEmail(MINIMO)?.porta).toBe(465);
    expect(configEmail(MINIMO)?.provedor).toBe("smtp");
  });

  it("porta que não é porta estoura", () => {
    expect(() => configEmail({ ...MINIMO, SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
    expect(() => configEmail({ ...MINIMO, SMTP_PORT: "0" })).toThrow(/SMTP_PORT/);
  });
});

// ─────────────────────────── Resend (decisão 44) ───────────────────────────
//
// O provedor que está de pé. Cada caso abaixo é uma diferença REAL em relação ao
// Gmail — não é o mesmo teste com outro host.

const RESEND = {
  API_KEY_RESEND: "re_umachavequalquer",
  RELATORIO_EMAIL_PARA: "isaac@exemplo.com",
};

describe("configEmail com Resend", () => {
  it("a chave sozinha basta: host, porta e usuário têm padrão", () => {
    // Diferente do SMTP, aqui não existe "meia configuração" possível — a chave
    // é a única coisa secreta, e o resto é sempre igual.
    const c = configEmail(RESEND);
    expect(c?.provedor).toBe("resend");
    expect(c?.host).toBe("smtp.resend.com");
    expect(c?.porta).toBe(465);
    expect(c?.usuario).toBe("resend");
    expect(c?.senha).toBe("re_umachavequalquer");
  });

  it("a chave do Resend tem precedência sobre um bloco SMTP preenchido", () => {
    // O .env guarda os dois: o SMTP_* ficou lá do tempo do Gmail e do Brevo.
    // Sem esta regra, o relatório sairia pelo provedor abandonado.
    expect(configEmail({ ...MINIMO, ...RESEND })?.provedor).toBe("resend");
  });

  it("sem RELATORIO_EMAIL_DE, assina como onboarding@resend.dev", () => {
    // É o ÚNICO remetente aceito sem domínio verificado. Cair no `usuario`, como
    // faz o SMTP, produziria "resend" — que nem endereço é.
    expect(configEmail(RESEND)?.de).toBe("onboarding@resend.dev");
  });

  it("sem destino não há padrão possível — e o erro diz por quê", () => {
    // No SMTP o padrão é a própria conta; aqui a conta é a palavra "resend".
    // Herdar esse padrão mandaria o relatório para um endereço inexistente.
    expect(() => configEmail({ API_KEY_RESEND: "re_x" })).toThrow(
      /RELATORIO_EMAIL_PARA/,
    );
  });

  it("2465 também é TLS direto, e 587 não é", () => {
    // O Resend aceita cinco portas; só 465 e 2465 falam TLS desde o 1º byte.
    expect(configEmail({ ...RESEND, PORT_RESEND: "2465" })?.seguro).toBe(true);
    expect(configEmail({ ...RESEND, PORT_RESEND: "587" })?.seguro).toBe(false);
    expect(configEmail({ ...RESEND, PORT_RESEND: "2587" })?.seguro).toBe(false);
  });

  it("porta inválida acusa PORT_RESEND, não SMTP_PORT", () => {
    // Mandar conferir a variável errada é o mesmo defeito que esta base combate
    // desde o explicarErro do Siscobra.
    expect(() => configEmail({ ...RESEND, PORT_RESEND: "abc" })).toThrow(
      /PORT_RESEND/,
    );
  });
});

describe("explicarErroEmail", () => {
  const ONDE = "smtp.gmail.com:465";

  it("login recusado manda para a SENHA DE APP, que é o caso número um", () => {
    // Sem esta frase a pessoa passa a tarde redigitando a senha certa da conta,
    // que o Gmail recusa sempre quando há verificação em duas etapas.
    const f = explicarErroEmail({ code: "EAUTH", message: "Invalid login" }, ONDE);
    expect(f).toMatch(/SENHA DE APP/);
    expect(f).toMatch(/apppasswords/);
  });

  it("reconhece o 535 do Gmail mesmo sem o code", () => {
    expect(
      explicarErroEmail({ message: "535-5.7.8 Username and Password not accepted" }, ONDE),
    ).toMatch(/SENHA DE APP/);
  });

  it("porta bloqueada NÃO é confundida com senha errada", () => {
    // Mandar conferir a senha quem está com a porta fechada é mandar a pessoa
    // para o lugar errado — a mesma régua do explicarErro do Siscobra.
    const f = explicarErroEmail({ code: "ETIMEDOUT", message: "Connection timeout" }, ONDE);
    expect(f).toMatch(/SMTP_HOST e SMTP_PORT/);
    expect(f).not.toMatch(/SENHA DE APP/);
  });

  it("destinatário recusado aponta para o .env certo", () => {
    expect(
      explicarErroEmail({ code: "EENVELOPE", message: "No recipients" }, ONDE),
    ).toMatch(/RELATORIO_EMAIL_PARA/);
  });

  it("o que não se reconhece sai como veio, sem palpite", () => {
    expect(explicarErroEmail(new Error("coisa estranha"), ONDE)).toMatch(
      /^coisa estranha\./,
    );
  });

  it("no Resend, login recusado NÃO fala em senha de app", () => {
    // O conselho do Gmail aqui é pior do que nenhum: manda gerar uma senha de
    // app numa conta que não tem nada a ver com o envio.
    const f = explicarErroEmail({ code: "EAUTH", message: "Invalid login" }, ONDE, "resend");
    expect(f).toMatch(/API_KEY_RESEND/);
    expect(f).not.toMatch(/SENHA DE APP/);
  });

  it("domínio não verificado aponta para o REMETENTE, não para o destinatário", () => {
    // Este é o erro que estava barrando o envio em 28/08/2026: o .env assinava
    // com um Gmail pessoal, e o Resend devolvia 403. Ele chega disfarçado de
    // recusa de envelope, e o ramo EENVELOPE mandaria conferir o destinatário.
    const f = explicarErroEmail(
      {
        code: "EENVELOPE",
        message:
          "The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      },
      ONDE,
      "resend",
    );
    expect(f).toMatch(/REMETENTE/);
    expect(f).toMatch(/RELATORIO_EMAIL_DE/);
    expect(f).not.toMatch(/RELATORIO_EMAIL_PARA/);
  });

  it("o limite de destinatário do remetente de cortesia é explicado", () => {
    const f = explicarErroEmail(
      { message: "You can only send testing emails to your own email address" },
      ONDE,
      "resend",
    );
    expect(f).toMatch(/dono da conta/);
    expect(f).toMatch(/resend\.com\/domains/);
  });

  it("servidor inalcançável nomeia a variável do provedor certo", () => {
    const e = { code: "ETIMEDOUT", message: "Connection timeout" };
    expect(explicarErroEmail(e, ONDE, "resend")).toMatch(/HOST_RESEND e PORT_RESEND/);
    expect(explicarErroEmail(e, ONDE, "smtp")).toMatch(/SMTP_HOST e SMTP_PORT/);
  });

  it("toda frase lembra que a planilha está salva", () => {
    // Quem lê o erro precisa saber que não perdeu as nove consultas ao CRM.
    for (const e of [
      { code: "EAUTH", message: "x" },
      { code: "ETIMEDOUT", message: "x" },
      { code: "EENVELOPE", message: "x" },
      new Error("x"),
    ]) {
      expect(explicarErroEmail(e, ONDE)).toMatch(/planilha foi gerada|está no disco/);
    }
  });
});

describe("ondeFicaOSmtp", () => {
  it("sai no formato que se digita num teste de conexão", () => {
    const cfg = { host: "smtp.gmail.com", porta: 465 } as ConfigEmail;
    expect(ondeFicaOSmtp(cfg)).toBe("smtp.gmail.com:465");
  });
});
