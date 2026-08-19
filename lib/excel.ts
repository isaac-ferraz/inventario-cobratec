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
import {
  BORDA_LEVE,
  COR_BARRA,
  COR_CABECALHO,
  COR_TEXTO_CABECALHO,
  FMT_DATA,
  FMT_MOEDA,
  adicionarBlocoIndicador,
  dataCelula,
  estilizarCabecalho,
  formatarColuna,
  ligarAutoFiltro,
} from "@/lib/excel-estilo";
import {
  DIAS_AVISO_GARANTIA,
  ROTULO_SITUACAO,
  ROTULO_TIPO_MANUTENCAO,
  estadoGarantia,
  somarCustos,
  type Situacao,
  type TipoManutencao,
} from "@/lib/ativos";

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

  const manutencoes = await prisma.manutencao.findMany({
    include: {
      computador: { select: { identificador: true } },
      celular: { select: { identificador: true } },
      chamado: { select: { numero: true } },
    },
    orderBy: [{ concluidaEm: "asc" }, { abertaEm: "desc" }],
  });

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
    { header: "Situação", key: "situacao", width: 15 },
    { header: "Aquisição", key: "dataAquisicao", width: 12 },
    { header: "Garantia até", key: "garantiaAte", width: 13 },
    { header: "Nota fiscal", key: "notaFiscal", width: 16 },
    { header: "Valor de compra", key: "valorCompra", width: 15 },
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
      situacao: ROTULO_SITUACAO[c.situacao as Situacao] ?? c.situacao,
      dataAquisicao: dataCelula(c.dataAquisicao),
      garantiaAte: dataCelula(c.garantiaAte),
      notaFiscal: c.notaFiscal ?? "",
      valorCompra: c.valorCompra ?? null,
      qtde: c.componentes.length,
      componentes: componentesTxt,
      observacoes: c.observacoes ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }

  // Data ordena como data e dinheiro sai em reais — as duas colunas eram texto
  // e número cru até a decisão 39, e nenhum dos dois filtrava no Excel.
  formatarColuna(inv, "dataAquisicao", FMT_DATA);
  formatarColuna(inv, "garantiaAte", FMT_DATA);
  formatarColuna(inv, "valorCompra", FMT_MOEDA);
  ligarAutoFiltro(inv, inv.columns.length);

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
    { header: "Situação", key: "situacao", width: 15 },
    { header: "Aquisição", key: "dataAquisicao", width: 12 },
    { header: "Garantia até", key: "garantiaAte", width: 13 },
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
      situacao: ROTULO_SITUACAO[c.situacao as Situacao] ?? c.situacao,
      dataAquisicao: dataCelula(c.dataAquisicao),
      garantiaAte: dataCelula(c.garantiaAte),
      observacoes: c.observacoes ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }

  formatarColuna(cel, "dataAquisicao", FMT_DATA);
  formatarColuna(cel, "garantiaAte", FMT_DATA);
  ligarAutoFiltro(cel, cel.columns.length);

  // ----- Aba "Manutenções" -----
  const man = wb.addWorksheet("Manutenções", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  man.columns = [
    { header: "Equipamento", key: "equipamento", width: 18 },
    { header: "Tipo", key: "tipo", width: 22 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Situação", key: "situacao", width: 14 },
    { header: "Aberta em", key: "abertaEm", width: 12 },
    { header: "Concluída em", key: "concluidaEm", width: 13 },
    { header: "Fornecedor", key: "fornecedor", width: 24 },
    { header: "Custo", key: "custo", width: 12 },
    { header: "Chamado", key: "chamado", width: 10 },
    { header: "Observações", key: "observacoes", width: 30 },
  ];
  estilizarCabecalho(man.getRow(1));

  for (const m of manutencoes) {
    const row = man.addRow({
      equipamento:
        m.computador?.identificador ?? m.celular?.identificador ?? "(removido)",
      tipo: ROTULO_TIPO_MANUTENCAO[m.tipo as TipoManutencao] ?? m.tipo,
      descricao: m.descricao,
      situacao: m.concluidaEm ? "Concluída" : "No conserto",
      abertaEm: dataCelula(m.abertaEm),
      concluidaEm: dataCelula(m.concluidaEm),
      fornecedor: m.fornecedor ?? "",
      custo: m.custo ?? null,
      chamado: m.chamado ? `#${m.chamado.numero}` : "",
      observacoes: m.observacoes ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDA_LEVE));
  }

  formatarColuna(man, "abertaEm", FMT_DATA);
  formatarColuna(man, "concluidaEm", FMT_DATA);
  formatarColuna(man, "custo", FMT_MOEDA);
  ligarAutoFiltro(man, man.columns.length);

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

  // Ciclo de vida — a mesma leitura do Dashboard do site.
  const equipamentos = [...computadores, ...celulares];
  const cicloVida: [string, number][] = [
    [
      "Em manutenção (no conserto)",
      equipamentos.filter((e) => e.situacao === "manutencao").length,
    ],
    [
      `Garantia acabando (${DIAS_AVISO_GARANTIA} dias)`,
      equipamentos.filter((e) => estadoGarantia(e.garantiaAte) === "vencendo")
        .length,
    ],
    [
      "Fora da garantia",
      equipamentos.filter((e) => estadoGarantia(e.garantiaAte) === "vencida")
        .length,
    ],
    [
      "Sem garantia registrada",
      equipamentos.filter((e) => !e.garantiaAte).length,
    ],
    ["Descartados", equipamentos.filter((e) => e.situacao === "descartado").length],
  ];

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
    ["Manutenções registradas", manutencoes.length],
    ["Manutenções em aberto", manutencoes.filter((m) => !m.concluidaEm).length],
    ["Custo total de manutenção", somarCustos(manutencoes)],
  ];
  for (const [label, valor] of kpis) {
    dash.getCell(`A${r}`).value = label;
    dash.getCell(`A${r}`).font = { bold: true };
    const cv = dash.getCell(`B${r}`);
    cv.value = valor;
    cv.alignment = { horizontal: "center" };
    cv.font = { bold: true, size: 12 };
    if (label.startsWith("Custo")) cv.numFmt = FMT_MOEDA;
    dash.getCell(`A${r}`).border = BORDA_LEVE;
    cv.border = BORDA_LEVE;
    r++;
  }

  // ─── Os blocos, cada um com sua barra de dados ───
  //
  // `adicionarBlocoIndicador` devolve a próxima linha livre, e é por isso que a
  // aritmética `r += 1 + tamanho + 1` sumiu daqui: ela não contava a linha do
  // "(sem dados)", então um bloco vazio fazia o SEGUINTE escrever por cima dele.
  // Com o parque cheio isso nunca aparecia; num banco recém-instalado, sim.
  r += 1;
  r = adicionarBlocoIndicador(
    dash,
    r,
    "Computadores por cargo",
    [...porCargo.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.azul },
  );
  r = adicionarBlocoIndicador(
    dash,
    r,
    "Computadores por sala",
    [...porSala.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.violeta },
  );
  r = adicionarBlocoIndicador(
    dash,
    r,
    "Componentes por tipo (mais comuns no topo)",
    [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.verde },
  );
  r = adicionarBlocoIndicador(dash, r, "Ciclo de vida dos equipamentos", cicloVida, {
    cor: COR_BARRA.vermelho,
  });
  adicionarBlocoIndicador(
    dash,
    r,
    "Pendências de licença / conta (computadores sem o item)",
    pendencias,
    { cor: COR_BARRA.ambar },
  );

  return wb.xlsx.writeBuffer();
}
