// A exportação da planilha de relatórios — o portão e o arquivo.
//
// O Siscobra é dublê: o que se testa aqui não é o número, e sim quem consegue
// levar qual aba, e se o arquivo que sai abre. Duas coisas que dão errado calado:
//
//   • uma aba fora do alcance entregue VAZIA em vez de recusada, que produz uma
//     planilha com cara de completa (a doença da decisão 30);
//   • um .xlsx corrompido, que só aparece quando alguém tenta abrir.
//
// Por isso o arquivo é REABERTO com o exceljs no fim: gerar sem exceção não
// prova que o Excel consegue ler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { criarUsuario, limparBanco, requisicao } from "./ajuda";

vi.mock("@/lib/siscobra", () => ({
  configSiscobra: vi.fn(() => true),
}));
vi.mock("@/lib/relatorios-cobranca", () => ({
  acordosDo: vi.fn(),
  acionamentosDe: vi.fn(),
  equipes: vi.fn(),
  carteiras: vi.fn(),
  operadoras: vi.fn(),
}));
vi.mock("@/lib/relatorios-carteira", () => ({
  aVencerEm: vi.fn(),
  emAtrasoAte: vi.fn(),
  quebrasDe: vi.fn(),
  primeiraParcelaDe: vi.fn(),
  listarParcelas: vi.fn(),
}));
vi.mock("@/lib/relatorios-comissao", () => ({
  comissaoDe: vi.fn(),
  comissaoDisponivel: vi.fn(async () => true),
}));

import { configSiscobra } from "@/lib/siscobra";
import { acionamentosDe, acordosDo, carteiras, equipes, operadoras } from "@/lib/relatorios-cobranca";
import {
  aVencerEm,
  emAtrasoAte,
  listarParcelas,
  primeiraParcelaDe,
  quebrasDe,
} from "@/lib/relatorios-carteira";
import { comissaoDe } from "@/lib/relatorios-comissao";
import { GET } from "@/app/api/relatorios/exportar/route";

const fatia = (rotulo: string, qtd: number, valor: number) => ({
  chave: 1,
  rotulo,
  qtd,
  valor,
});

const MATRIZ = {
  celulas: [
    {
      operadora: 260,
      operadoraNome: "YASMIN",
      carteira: 7,
      carteiraNome: "FESTCARD",
      qtd: 4,
      valor: 1200,
    },
  ],
  truncada: false,
};

beforeEach(async () => {
  await limparBanco();
  vi.mocked(configSiscobra).mockReturnValue(true);
  vi.mocked(acordosDo).mockResolvedValue({
    qtd: 97,
    valor: 340979.54,
    porOperadora: [fatia("YASMIN", 18, 3285.21)],
    porCarteira: [fatia("FESTCARD", 9, 8004.56)],
    porHora: [fatia("09h", 19, 40000)],
    porMes: [fatia("08/2026", 97, 340979.54)],
    matriz: MATRIZ,
  });
  vi.mocked(acionamentosDe).mockResolvedValue({
    qtd: 3052,
    devedores: 2470,
    porOperadora: [fatia("ANA JULIA", 340, 334)],
    porSituacao: [fatia("RECADO", 774, 700)],
    porHora: [fatia("09h", 500, 480)],
    porMes: [fatia("08/2026", 3052, 2470)],
  });
  vi.mocked(aVencerEm).mockResolvedValue({
    qtd: 12,
    valor: 8400.5,
    hoje: { qtd: 2, valor: 900 },
    amanha: { qtd: 3, valor: 1100 },
    porDia: [fatia("14/08", 2, 900)],
    porCarteira: [fatia("FESTCARD", 12, 8400.5)],
    porOperadora: [fatia("YASMIN", 12, 8400.5)],
  });
  vi.mocked(emAtrasoAte).mockResolvedValue({
    qtd: 40,
    valor: 22000,
    desde: "2026-02-15",
    porFaixa: [fatia("1 a 7 dias", 10, 2000)],
    porCarteira: [fatia("FESTCARD", 40, 22000)],
    porOperadora: [fatia("YASMIN", 40, 22000)],
  });
  vi.mocked(quebrasDe).mockResolvedValue({
    qtd: 5,
    valor: 3000,
    porCarteira: [fatia("FESTCARD", 5, 3000)],
    porOperadora: [fatia("YASMIN", 5, 3000)],
  });
  vi.mocked(primeiraParcelaDe).mockResolvedValue({
    avaliados: 40,
    pagos: 26,
    valorPago: 13000,
    porCarteira: [fatia("FESTCARD", 25, 20)],
  });
  vi.mocked(comissaoDe).mockResolvedValue({
    qtd: 88,
    valor: 4500.25,
    recebido: 90000,
    porOperadora: [fatia("YASMIN", 30, 1500)],
    porCarteira: [fatia("FESTCARD", 88, 4500.25)],
    porMes: [fatia("08/2026", 88, 4500.25)],
    matriz: MATRIZ,
    conferida: false,
    ressalva: "Comissão ainda não conferida contra o relatório oficial do Siscobra.",
  });
  vi.mocked(listarParcelas).mockResolvedValue([
    {
      acocod: 1,
      devcod: 2,
      parcela: 1,
      nome: "FULANO DE TAL",
      cpf: "123.***.***-99",
      carteira: "FESTCARD",
      operadora: "YASMIN",
      valor: 300,
      vencimento: "2026-08-20",
      dias: 6,
    },
  ]);
  vi.mocked(equipes).mockResolvedValue([{ cod: 30, nome: "EQUIPE AZUL", membros: 7 }]);
  vi.mocked(carteiras).mockResolvedValue([{ cod: 7, nome: "FESTCARD" }]);
  vi.mocked(operadoras).mockResolvedValue([
    { cod: 260, nome: "YASMIN", equipe: "EQUIPE AZUL" },
  ]);
});

afterEach(() => vi.clearAllMocks());

type Papel = "ADMIN" | "SUPERVISOR" | "COBRANCA" | "OPERADOR";

async function pedir(url: string, papel?: Papel) {
  const usuario = papel
    ? await criarUsuario(`quem-${papel.toLowerCase()}`, papel)
    : undefined;
  return GET(await requisicao("GET", url, { usuario }));
}

async function abrir(res: Response): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // O cast é da divergência entre o `Buffer` do @types/node novo e o que o
  // exceljs declara; em runtime é o mesmo objeto.
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
  return wb;
}

describe("quem alcança a exportação", () => {
  it("o operador de helpdesk não entra", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=resumo", "OPERADOR");
    expect(res.status).toBe(403);
  });

  it("sem sessão é 401", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=resumo");
    expect(res.status).toBe(401);
  });

  it("o portão vem ANTES de qualquer consulta ao CRM", async () => {
    await pedir("/api/relatorios/exportar?abas=acordos-operadora", "OPERADOR");
    expect(acordosDo).not.toHaveBeenCalled();
  });
});

describe("o recorte por papel é do servidor", () => {
  it("recusa NOMEANDO a aba, em vez de entregá-la vazia", async () => {
    // O ponto: um 403 seco mandaria a pessoa adivinhar qual das quinze
    // caixinhas ela não podia ter marcado.
    const res = await pedir(
      "/api/relatorios/exportar?abas=resumo,acordos-operadora",
      "COBRANCA",
    );
    expect(res.status).toBe(403);
    const corpo = (await res.json()) as { erro: string };
    expect(corpo.erro).toContain("Acordos · operadora");
    expect(acordosDo).not.toHaveBeenCalled();
  });

  it("o supervisor não leva a aba nominal (decisão 36 intacta)", async () => {
    const res = await pedir(
      "/api/relatorios/exportar?abas=parcelas",
      "SUPERVISOR",
    );
    expect(res.status).toBe(403);
    expect(listarParcelas).not.toHaveBeenCalled();
  });

  it("a cobrança leva a aba nominal — é a agenda de trabalho dela", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=parcelas", "COBRANCA");
    expect(res.status).toBe(200);
    const wb = await abrir(res);
    expect(wb.getWorksheet("Parcelas (nominal)")).toBeDefined();
  });

  it("a cobrança não leva a aba de comissão (ranking nominal de colega)", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=comissao", "COBRANCA");
    expect(res.status).toBe(403);
    expect(comissaoDe).not.toHaveBeenCalled();
  });

  it("a cobrança não pode FILTRAR por operadora", async () => {
    const res = await pedir(
      "/api/relatorios/exportar?abas=carteira-a-vencer&operadora=260",
      "COBRANCA",
    );
    expect(res.status).toBe(403);
  });
});

describe("o pedido", () => {
  it("sem aba nenhuma é 400", async () => {
    const res = await pedir("/api/relatorios/exportar", "ADMIN");
    expect(res.status).toBe(400);
  });

  it("aba inventada é 400 e diz o nome", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=inventada", "ADMIN");
    expect(res.status).toBe(400);
    expect(String(((await res.json()) as { erro: string }).erro)).toContain("inventada");
  });

  it("só a capa não é relatório", async () => {
    // "parametros" sozinha não tem fonte nenhuma — devolveria uma planilha com
    // uma aba de metadados e nada dentro.
    const res = await pedir("/api/relatorios/exportar?abas=parametros", "ADMIN");
    expect(res.status).toBe(400);
  });

  it("recusa recorte com mais códigos que o teto", async () => {
    const muitos = Array.from({ length: 51 }, (_, i) => i + 1).join(",");
    const res = await pedir(
      `/api/relatorios/exportar?abas=acordos-carteira&carteira=${muitos}`,
      "ADMIN",
    );
    expect(res.status).toBe(400);
    expect(acordosDo).not.toHaveBeenCalled();
  });

  it("consulta cada fonte UMA vez, mesmo com quatro abas dela", async () => {
    const res = await pedir(
      "/api/relatorios/exportar?abas=acordos-operadora,acordos-carteira,acordos-hora,acordos-matriz",
      "ADMIN",
    );
    expect(res.status).toBe(200);
    // Quatro abas, um GROUPING SETS. É o motivo de as abas declararem "fonte".
    expect(acordosDo).toHaveBeenCalledTimes(1);
  });

  it("as duas janelas chegam separadas nas consultas certas", async () => {
    // `inicio`/`fim` são do PERÍODO (para trás); `janelaInicio`/`janelaFim` são
    // da JANELA (para frente). Trocar as duas daria acordo com data de
    // vencimento — nenhum erro, e um número errado.
    await pedir(
      "/api/relatorios/exportar?abas=acordos-operadora,carteira-a-vencer" +
        "&periodo=personalizado&inicio=2026-07-01&fim=2026-07-31" +
        "&janela=personalizado&janelaInicio=2026-08-14&janelaFim=2026-08-20",
      "ADMIN",
    );
    const fAcordo = vi.mocked(acordosDo).mock.calls[0][0];
    expect([fAcordo.inicio, fAcordo.fim]).toEqual(["2026-07-01", "2026-07-31"]);
    const fVencer = vi.mocked(aVencerEm).mock.calls[0][0];
    expect([fVencer.inicio, fVencer.fim]).toEqual(["2026-08-14", "2026-08-20"]);
  });
});

describe("o arquivo que sai", () => {
  it("abre no exceljs e tem a capa mesmo sem ser pedida", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=acordos-operadora", "ADMIN");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toMatch(/\.xlsx"$/);

    const wb = await abrir(res);
    const nomes = wb.worksheets.map((w) => w.name);
    // A capa entra sempre: planilha sem o recorte que a gerou vira número sem
    // dono na primeira vez que alguém a encaminha.
    expect(nomes).toContain("Parâmetros");
    expect(nomes).toContain("Acordos · operadora");
  });

  it("a capa carrega o recorte por NOME, não por código", async () => {
    const res = await pedir(
      "/api/relatorios/exportar?abas=acordos-carteira&carteira=7&equipe=30",
      "ADMIN",
    );
    const wb = await abrir(res);
    const ws = wb.getWorksheet("Parâmetros")!;
    const texto = JSON.stringify(ws.getSheetValues());
    expect(texto).toContain("FESTCARD");
    expect(texto).toContain("EQUIPE AZUL");
  });

  it("a ressalva da comissão vai junto na capa", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=comissao", "ADMIN");
    const wb = await abrir(res);
    const texto = JSON.stringify(wb.getWorksheet("Parâmetros")!.getSheetValues());
    expect(texto).toContain("não conferida");
  });

  it("a ressalva do atraso também — “em atraso” não é “não pagou”", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=carteira-atraso", "ADMIN");
    const wb = await abrir(res);
    const texto = JSON.stringify(wb.getWorksheet("Parâmetros")!.getSheetValues());
    expect(texto).toContain("NÃO encontramos a baixa");
    expect(texto).toContain("Não é o mesmo que “o devedor não pagou”");
  });

  it("valor sai como número com formato de moeda, não como texto", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=acordos-operadora", "ADMIN");
    const wb = await abrir(res);
    const cell = wb.getWorksheet("Acordos · operadora")!.getCell("C2");
    expect(typeof cell.value).toBe("number");
    expect(cell.numFmt).toContain("R$");
  });

  it("a matriz sai com as duas dimensões em colunas próprias", async () => {
    const res = await pedir("/api/relatorios/exportar?abas=acordos-matriz", "ADMIN");
    const wb = await abrir(res);
    const ws = wb.getWorksheet("Acordos · oper x carteira")!;
    expect(ws.getCell("A2").value).toBe("YASMIN");
    expect(ws.getCell("B2").value).toBe("FESTCARD");
  });
});
