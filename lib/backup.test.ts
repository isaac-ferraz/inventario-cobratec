// As decisões do backup, sem tocar em disco.
//
// O que se testa aqui é a rotação, porque é a única parte que APAGA — e apagar
// backup errado é o defeito que só aparece no dia em que se precisa dele.
import { describe, expect, it } from "vitest";
import { diasDeRetencao, nomeDoBackup, paraApagar } from "./backup";

const dias = (n: number) => new Date(Date.now() - n * 86_400_000);
const AGORA = new Date();

describe("nomeDoBackup", () => {
  it("usa o fuso do Brasil, não o do container", () => {
    // 01h UTC de 15/08 ainda é 22h de 14/08 em São Paulo — e é justamente o
    // horário da tarefa. Com UTC, a cópia das 22h levaria a data do dia
    // seguinte e a pasta ficaria com um dia sem nenhuma e outro com duas.
    expect(nomeDoBackup(new Date("2026-08-15T01:00:00Z"))).toBe(
      "inventario-20260814-220000.db",
    );
  });

  it("casa com o padrão que a rotação procura", () => {
    const nome = nomeDoBackup(new Date("2026-01-02T15:04:05Z"));
    expect(paraApagar([{ nome, modificadoEm: dias(90) }], AGORA, 30)).toEqual([
      nome,
    ]);
  });
});

describe("paraApagar", () => {
  it("leva o que passou da janela e mantém o resto", () => {
    const arquivos = [
      { nome: "inventario-20260101-220000.db", modificadoEm: dias(40) },
      { nome: "inventario-20260210-220000.db", modificadoEm: dias(29) },
      { nome: "inventario-20260301-220000.db", modificadoEm: dias(1) },
    ];
    expect(paraApagar(arquivos, AGORA, 30)).toEqual([
      "inventario-20260101-220000.db",
    ]);
  });

  it("não encosta em arquivo que não é dele", () => {
    // O caso real: `backups/dev-seed-para-servidor.db`, colocado ali à mão
    // porque importava. Varrer a pasta inteira levaria exatamente esse.
    const arquivos = [
      { nome: "dev-seed-para-servidor.db", modificadoEm: dias(400) },
      { nome: "antes-da-migracao.db", modificadoEm: dias(400) },
      { nome: "inventario-20250101-220000.db", modificadoEm: dias(400) },
    ];
    expect(paraApagar(arquivos, AGORA, 30)).toEqual([
      "inventario-20250101-220000.db",
    ]);
  });

  it("a cópia recém-criada nunca entra na rotação", () => {
    const nome = nomeDoBackup(AGORA);
    expect(paraApagar([{ nome, modificadoEm: AGORA }], AGORA, 1)).toEqual([]);
  });
});

describe("diasDeRetencao", () => {
  it("o padrão é 30", () => {
    expect(diasDeRetencao({})).toBe(30);
  });

  it("lê o .env", () => {
    expect(diasDeRetencao({ BACKUP_DIAS: "90" })).toBe(90);
  });

  it("piso de 1 dia: zero apagaria a cópia recém-feita", () => {
    expect(diasDeRetencao({ BACKUP_DIAS: "0" })).toBe(30);
    expect(diasDeRetencao({ BACKUP_DIAS: "-5" })).toBe(30);
    expect(diasDeRetencao({ BACKUP_DIAS: "sim" })).toBe(30);
  });
});
