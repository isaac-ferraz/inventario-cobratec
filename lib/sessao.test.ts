import { describe, it, expect, beforeAll } from "vitest";
import { assinarSessao, lerSessao, ehAdmin, segredo } from "./sessao";

const DADOS = { uid: "u1", login: "ti.admin", papel: "ADMIN" as const };

beforeAll(() => {
  process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente";
});

describe("sessão assinada", () => {
  it("ida e volta preserva os dados", async () => {
    const token = await assinarSessao(DADOS);
    const sessao = await lerSessao(token);
    expect(sessao).toMatchObject(DADOS);
    expect(typeof sessao?.exp).toBe("number");
  });

  it("recusa token adulterado (é o ponto de toda a assinatura)", async () => {
    const token = await assinarSessao(DADOS);
    const [payload, assinatura] = token.split(".");

    // Troca o papel para ADMIN no payload e mantém a assinatura antiga.
    const forjado = Buffer.from(
      JSON.stringify({ ...DADOS, papel: "ADMIN", exp: 99999999999 }),
    )
      .toString("base64url")
      .replace(/=+$/, "");
    expect(await lerSessao(`${forjado}.${assinatura}`)).toBeNull();

    // Assinatura mexida também não passa.
    //
    // A mudança tem que ser no PRIMEIRO caractere, e não no último. A assinatura
    // tem 32 bytes, que em base64url dão 43 caracteres — e o último carrega 2
    // bits que não significam nada. "…V9BA" e "…V9BB" decodificam para os mesmos
    // 32 bytes, e o verificador compara BYTES: mexer no fim às vezes não mexia em
    // nada, e o teste falhava sozinho 1 vez em ~1.100 execuções. Medido.
    const outra = (assinatura[0] === "A" ? "B" : "A") + assinatura.slice(1);
    expect(outra).not.toBe(assinatura);
    expect(await lerSessao(`${payload}.${outra}`)).toBeNull();
  });

  it("recusa sessão expirada", async () => {
    const agora = 1_000_000;
    const token = await assinarSessao(DADOS, 60, agora);
    expect(await lerSessao(token, agora + 30)).not.toBeNull();
    expect(await lerSessao(token, agora + 61)).toBeNull();
  });

  it("recusa lixo e ausência sem lançar exceção", async () => {
    for (const t of [undefined, null, "", "sem-ponto", ".", "a.b"]) {
      expect(await lerSessao(t)).toBeNull();
    }
  });

  it("assinada com outro segredo não é aceita", async () => {
    const token = await assinarSessao(DADOS);
    process.env.AUTH_SECRET = "outro-segredo-completamente-diferente";
    expect(await lerSessao(token)).toBeNull();
    process.env.AUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente";
  });

  it("exige AUTH_SECRET definido e longo", () => {
    const salvo = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "";
    expect(() => segredo()).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = "curto";
    expect(() => segredo()).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = salvo;
  });
});

describe("ehAdmin", () => {
  it("só é verdadeiro para papel ADMIN", () => {
    expect(ehAdmin({ ...DADOS, exp: 1 })).toBe(true);
    expect(ehAdmin({ ...DADOS, papel: "OPERADOR", exp: 1 })).toBe(false);
    expect(ehAdmin(null)).toBe(false);
  });
});
