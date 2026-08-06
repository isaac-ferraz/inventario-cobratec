// Geração do relatório Excel (.xlsx) a partir dos dados atuais do banco.
// Duas abas: "Inventário" (dados) e "Dashboard" (indicadores).
//
// NOTA TÉCNICA: a biblioteca `exceljs` NÃO suporta criar gráficos nativos do
// Excel na escrita (apenas leitura). Por isso o Dashboard usa tabelas de
// indicadores com BARRAS DE DADOS (data bars) via formatação condicional —
// que são nativas do Excel e atualizam com a célula, sem virar imagem estática.
// Decisão registrada em /docs/decisoes.md.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

const COR_CABECALHO = "FF1F2937"; // cinza-azulado escuro
const COR_TEXTO_CABECALHO = "FFFFFFFF";
const BORDA_LEVE: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function estilizarCabecalho(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR_CABECALHO },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = BORDA_LEVE;
  });
  row.height = 20;
}

export async function gerarWorkbook(): Promise<ExcelJS.Buffer> {
  const [computadores, celulares] = await Promise.all([
    prisma.computador.findMany({
      include: {
        funcionario: true,
        sala: true,
        componentes: { include: { tipo: true } },
      },
      orderBy: { identificador: "asc" },
    }),
    prisma.celular.findMany({
      // A sala do celular é a do dono: o aparelho anda com a pessoa.
      include: { funcionario: { include: { sala: true } } },
      orderBy: { identificador: "asc" },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Cobratec TI — Inventário de Hardware";
  wb.created = new Date();

  // ----- Aba "Inventário" -----
  const inv = wb.addWorksheet("Inventário", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  inv.columns = [
    { header: "Identificador", key: "identificador", width: 18 },
    { header: "Apelido", key: "apelido", width: 22 },
    { header: "Funcionário", key: "funcionario", width: 24 },
    { header: "Cargo", key: "cargo", width: 18 },
    { header: "Sala", key: "sala", width: 24 },
    { header: "Status", key: "status", width: 14 },
    { header: "Login padrão", key: "loginPadrao", width: 14 },
    { header: "Conta Outlook", key: "contaOutlook", width: 26 },
    { header: "Licença Windows", key: "licencaWindows", width: 22 },
    { header: "Licença Microsoft", key: "licencaMicrosoft", width: 22 },
    { header: "Mouse", key: "temMouse", width: 8 },
    { header: "Teclado", key: "temTeclado", width: 9 },
    { header: "Headset", key: "temHeadset", width: 9 },
    { header: "Qtde componentes", key: "qtde", width: 16 },
    { header: "Componentes (hardware)", key: "componentes", width: 60 },
    { header: "Observações", key: "observacoes", width: 30 },
  ];
  estilizarCabecalho(inv.getRow(1));

  for (const c of computadores) {
    const componentesTxt = c.componentes
      .map((comp) => `${comp.tipo.nome}: ${comp.descricao}`)
      .join("\n");
    const row = inv.addRow({
      identificador: c.identificador,
      apelido: c.apelido ?? "",
      funcionario: c.funcionario?.nome ?? "— sem funcionário —",
      cargo: c.funcionario?.cargo ?? "",
      sala: c.sala?.nome ?? "— sem sala —",
      status: c.funcionario ? "Em uso" : "Estoque",
      loginPadrao: c.loginPadrao ?? "",
      contaOutlook: c.contaOutlook ?? "",
      licencaWindows: c.licencaWindows ?? "",
      licencaMicrosoft: c.licencaMicrosoft ?? "",
      temMouse: c.temMouse ? "Sim" : "Não",
      temTeclado: c.temTeclado ? "Sim" : "Não",
      temHeadset: c.temHeadset ? "Sim" : "Não",
      qtde: c.componentes.length,
      componentes: componentesTxt,
      observacoes: c.observacoes ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }

  // ----- Aba "Celulares" -----
  const cel = wb.addWorksheet("Celulares", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  cel.columns = [
    { header: "Identificador", key: "identificador", width: 18 },
    { header: "Modelo / apelido", key: "apelido", width: 24 },
    { header: "Funcionário", key: "funcionario", width: 24 },
    { header: "Cargo", key: "cargo", width: 18 },
    { header: "Sala do funcionário", key: "sala", width: 24 },
    { header: "Status", key: "status", width: 14 },
    { header: "Número", key: "numero", width: 18 },
    { header: "Operadora", key: "operadora", width: 14 },
    { header: "IMEI", key: "imei", width: 20 },
    { header: "Observações", key: "observacoes", width: 30 },
  ];
  estilizarCabecalho(cel.getRow(1));

  for (const c of celulares) {
    const row = cel.addRow({
      identificador: c.identificador,
      apelido: c.apelido ?? "",
      funcionario: c.funcionario?.nome ?? "— sem funcionário —",
      cargo: c.funcionario?.cargo ?? "",
      sala: c.funcionario?.sala?.nome ?? "— sem sala —",
      status: c.funcionario ? "Em uso" : "Estoque",
      numero: c.numero ?? "",
      operadora: c.operadora ?? "",
      imei: c.imei ?? "",
      observacoes: c.observacoes ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }

  // ----- Cálculo dos indicadores -----
  const total = computadores.length;
  const semFuncionario = computadores.filter((c) => !c.funcionario).length;
  const totalCelulares = celulares.length;
  const celularesSemFunc = celulares.filter((c) => !c.funcionario).length;

  const porCargo = new Map<string, number>();
  for (const c of computadores) {
    const cargo = c.funcionario?.cargo ?? "Sem funcionário (estoque)";
    porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + 1);
  }

  const porSala = new Map<string, number>();
  for (const c of computadores) {
    const sala = c.sala?.nome ?? "Sem sala definida";
    porSala.set(sala, (porSala.get(sala) ?? 0) + 1);
  }

  const porTipo = new Map<string, number>();
  for (const c of computadores) {
    for (const comp of c.componentes) {
      porTipo.set(comp.tipo.nome, (porTipo.get(comp.tipo.nome) ?? 0) + 1);
    }
  }

  // Pendências: computadores sem cada licença/conta registrada.
  const pendencias: [string, number][] = [
    ["Sem sala definida", computadores.filter((c) => !c.salaId).length],
    ["Sem licença Windows", computadores.filter((c) => !c.licencaWindows).length],
    [
      "Sem licença Microsoft / Office",
      computadores.filter((c) => !c.licencaMicrosoft).length,
    ],
    ["Sem conta Outlook", computadores.filter((c) => !c.contaOutlook).length],
    ["Sem login padrão", computadores.filter((c) => !c.loginPadrao).length],
    ["Sem headset", computadores.filter((c) => !c.temHeadset).length],
  ];

  // ----- Aba "Dashboard" -----
  const dash = wb.addWorksheet("Dashboard");
  dash.getColumn(1).width = 34;
  dash.getColumn(2).width = 16;

  // Título
  dash.mergeCells("A1:B1");
  const titulo = dash.getCell("A1");
  titulo.value = "Dashboard de Inventário — Cobratec TI";
  titulo.font = { bold: true, size: 14, color: { argb: COR_TEXTO_CABECALHO } };
  titulo.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COR_CABECALHO },
  };
  titulo.alignment = { vertical: "middle", horizontal: "center" };
  dash.getRow(1).height = 26;

  // KPIs principais
  let r = 3;
  const kpis: [string, number][] = [
    ["Total de computadores", total],
    ["Computadores em uso", total - semFuncionario],
    ["Computadores sem funcionário / em estoque", semFuncionario],
    ["Tipos de componente distintos", porTipo.size],
    ["Total de celulares", totalCelulares],
    ["Celulares em uso", totalCelulares - celularesSemFunc],
    ["Celulares sem funcionário / em estoque", celularesSemFunc],
  ];
  for (const [label, valor] of kpis) {
    dash.getCell(`A${r}`).value = label;
    dash.getCell(`A${r}`).font = { bold: true };
    const cv = dash.getCell(`B${r}`);
    cv.value = valor;
    cv.alignment = { horizontal: "center" };
    cv.font = { bold: true, size: 12 };
    dash.getCell(`A${r}`).border = BORDA_LEVE;
    cv.border = BORDA_LEVE;
    r++;
  }

  // Bloco: Computadores por cargo (tabela + data bar)
  r += 1;
  const blocoCargoInicio = r;
  adicionarBlocoIndicador(
    dash,
    r,
    "Computadores por cargo",
    [...porCargo.entries()].sort((a, b) => b[1] - a[1]),
  );
  r += 1 + porCargo.size + 1;

  // Bloco: Computadores por sala (tabela + data bar)
  const blocoSalaInicio = r;
  adicionarBlocoIndicador(
    dash,
    r,
    "Computadores por sala",
    [...porSala.entries()].sort((a, b) => b[1] - a[1]),
  );
  r += 1 + porSala.size + 1;

  // Bloco: Distribuição de componentes por tipo (tabela + data bar)
  const blocoTipoInicio = r;
  adicionarBlocoIndicador(
    dash,
    r,
    "Componentes por tipo (mais comuns no topo)",
    [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
  );
  r += 1 + porTipo.size + 1;

  // Bloco: Pendências de licença / conta
  const blocoPendInicio = r;
  adicionarBlocoIndicador(
    dash,
    r,
    "Pendências de licença / conta (computadores sem o item)",
    pendencias,
  );

  // Data bars (gráficos de barra nativos via formatação condicional)
  aplicarDataBar(dash, blocoCargoInicio + 1, porCargo.size, "FF2563EB");
  aplicarDataBar(dash, blocoSalaInicio + 1, porSala.size, "FF7C3AED");
  aplicarDataBar(dash, blocoTipoInicio + 1, porTipo.size, "FF059669");
  aplicarDataBar(dash, blocoPendInicio + 1, pendencias.length, "FFD97706");

  return wb.xlsx.writeBuffer();
}

function adicionarBlocoIndicador(
  ws: ExcelJS.Worksheet,
  linhaInicio: number,
  titulo: string,
  dados: [string, number][],
) {
  ws.mergeCells(`A${linhaInicio}:B${linhaInicio}`);
  const t = ws.getCell(`A${linhaInicio}`);
  t.value = titulo;
  t.font = { bold: true, color: { argb: COR_TEXTO_CABECALHO } };
  t.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COR_CABECALHO },
  };
  t.alignment = { vertical: "middle" };

  let linha = linhaInicio + 1;
  for (const [nome, valor] of dados) {
    ws.getCell(`A${linha}`).value = nome;
    ws.getCell(`A${linha}`).border = BORDA_LEVE;
    const cv = ws.getCell(`B${linha}`);
    cv.value = valor;
    cv.alignment = { horizontal: "center" };
    cv.border = BORDA_LEVE;
    linha++;
  }
  if (dados.length === 0) {
    ws.getCell(`A${linha}`).value = "(sem dados)";
    linha++;
  }
}

// Aplica barra de dados (data bar) nativa do Excel sobre a coluna B.
function aplicarDataBar(
  ws: ExcelJS.Worksheet,
  primeiraLinha: number,
  qtde: number,
  corArgb: string,
) {
  if (qtde <= 0) return;
  const ref = `B${primeiraLinha}:B${primeiraLinha + qtde - 1}`;
  // `color` é suportado pelo exceljs em runtime, mas não está no tipo
  // DataBarRuleType — por isso o cast via unknown.
  const regra = {
    type: "dataBar",
    cfvo: [{ type: "num", value: 0 }, { type: "max" }],
    color: { argb: corArgb },
    priority: 1,
  } as unknown as ExcelJS.DataBarRuleType;

  ws.addConditionalFormatting({ ref, rules: [regra] });
}
