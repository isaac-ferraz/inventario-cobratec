// Geração do relatório Excel (.xlsx) a partir dos dados atuais do banco.
// Duas abas: "Inventário" (dados) e "Dashboard" (indicadores).
//
// NOTA TÉCNICA: o `exceljs` continua sem saber ESCREVER gráfico — não existe
// `worksheet.addChart` em 4.4.0. O que mudou é que a limitação é da API e não do
// formato: `lib/excel-graficos.ts` acrescenta os gráficos nativos direto no zip
// do .xlsx, depois que o exceljs terminou. As barras de dados continuam, e não
// por herança: elas dizem o valor exato ao lado do nome, que é o que se copia
// para um e-mail. O gráfico é a leitura rápida; a barra é a fonte.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import {
  BORDA_LEVE,
  COR_BARRA,
  FMT_DATA,
  FMT_MOEDA,
  adicionarBlocoIndicador,
  cartaoKpi,
  dataCelula,
  estilizarCabecalho,
  faixaTitulo,
  formatarColuna,
  ligarAutoFiltro,
} from "@/lib/excel-estilo";
import { comGraficos, type PedidoGrafico } from "@/lib/excel-graficos";
import {
  DIAS_AVISO_GARANTIA,
  ROTULO_SITUACAO,
  ROTULO_TIPO_MANUTENCAO,
  estadoGarantia,
  somarCustos,
  type Situacao,
  type TipoManutencao,
} from "@/lib/ativos";

export async function gerarWorkbook(): Promise<Buffer> {
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
  //
  // O painel tem duas faixas verticais: à ESQUERDA (A:B) os blocos de número com
  // barra de dados, que continuam sendo a fonte — dá para ler o valor exato e
  // copiar. À DIREITA (D em diante) os cartões e os gráficos, que são a leitura
  // rápida. Os gráficos apontam para as células da esquerda, então os dois lados
  // nunca podem discordar: é o mesmo dado, desenhado duas vezes.
  const dash = wb.addWorksheet("Dashboard", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 2 }],
    // Painel largo impresso em retrato sai fatiado ao meio, e o pedaço que cai
    // na segunda folha são justamente os gráficos. Quem exporta para PDF quase
    // sempre está mandando por e-mail.
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  dash.getColumn(1).width = 34;
  dash.getColumn(2).width = 14;
  dash.getColumn(3).width = 2; // corredor entre os números e o painel
  for (let c = 4; c <= 19; c++) dash.getColumn(c).width = 9.5;

  faixaTitulo(
    dash,
    1,
    1,
    19,
    "Inventário de Hardware — Cobratec TI",
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
  );

  // ─── Cartões de KPI (duas fileiras de quatro, à direita) ───
  const emManutencao = manutencoes.filter((m) => !m.concluidaEm).length;
  const cartoes: [string, number, string, string?][] = [
    ["Computadores", total, COR_BARRA.azul],
    ["Em uso", total - semFuncionario, COR_BARRA.verde],
    ["Em estoque", semFuncionario, COR_BARRA.ambar],
    ["Tipos de componente", porTipo.size, COR_BARRA.ciano],
    ["Celulares", totalCelulares, COR_BARRA.violeta],
    ["Celulares em estoque", celularesSemFunc, COR_BARRA.ambar],
    ["Manutenções em aberto", emManutencao, COR_BARRA.vermelho],
    ["Custo de manutenção", somarCustos(manutencoes), COR_BARRA.vermelho, FMT_MOEDA],
  ];
  cartoes.forEach(([rotulo, valor, cor, fmt], i) => {
    const linha = 3 + Math.floor(i / 4) * 4;
    const col = 4 + (i % 4) * 4;
    cartaoKpi(dash, linha, col, rotulo, valor, { cor, numFmt: fmt, largura: 4 });
  });

  // ─── Os blocos, cada um com sua barra de dados ───
  //
  // `adicionarBlocoIndicador` devolve a próxima linha livre, e é por isso que a
  // aritmética `r += 1 + tamanho + 1` sumiu daqui: ela não contava a linha do
  // "(sem dados)", então um bloco vazio fazia o SEGUINTE escrever por cima dele.
  // Com o parque cheio isso nunca aparecia; num banco recém-instalado, sim.
  //
  // Agora ele devolve também o intervalo, que é o que o gráfico aponta.
  let r = 3;
  const bCargo = adicionarBlocoIndicador(
    dash,
    r,
    "Computadores por cargo",
    [...porCargo.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.azul },
  );
  const bSala = adicionarBlocoIndicador(
    dash,
    bCargo.proxima,
    "Computadores por sala",
    [...porSala.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.violeta },
  );
  const bTipo = adicionarBlocoIndicador(
    dash,
    bSala.proxima,
    "Componentes por tipo (mais comuns no topo)",
    [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    { cor: COR_BARRA.verde },
  );
  const bCiclo = adicionarBlocoIndicador(
    dash,
    bTipo.proxima,
    "Ciclo de vida dos equipamentos",
    cicloVida,
    { cor: COR_BARRA.vermelho },
  );
  adicionarBlocoIndicador(
    dash,
    bCiclo.proxima,
    "Pendências de licença / conta (computadores sem o item)",
    pendencias,
    { cor: COR_BARRA.ambar },
  );

  // ─── Os gráficos ───
  //
  // Bloco vazio não vira gráfico: um gráfico sem série abre no Excel como um
  // retângulo branco com o título dentro, que parece defeito da planilha.
  const graficos: PedidoGrafico[] = [];
  const pedir = (
    bloco: { linhaIni: number; linhaFim: number; vazio: boolean },
    p: Omit<PedidoGrafico, "aba" | "categorias">,
  ) => {
    if (bloco.vazio) return;
    graficos.push({
      aba: "Dashboard",
      categorias: { col: 1, linhaIni: bloco.linhaIni, linhaFim: bloco.linhaFim },
      ...p,
    });
  };

  pedir(bCargo, {
    tipo: "coluna",
    titulo: "Computadores por cargo",
    series: [{ nome: "Computadores", col: 2, cor: "2563EB" }],
    ancora: { col: 4, linha: 12, largura: 8, altura: 16 },
    legenda: "none",
    rotulos: true,
  });
  pedir(bSala, {
    tipo: "rosca",
    titulo: "Computadores por sala",
    series: [{ nome: "Computadores", col: 2 }],
    ancora: { col: 12, linha: 12, largura: 8, altura: 16 },
    legenda: "r",
  });
  pedir(bTipo, {
    tipo: "barra",
    titulo: "Componentes por tipo",
    series: [{ nome: "Componentes", col: 2, cor: "059669" }],
    ancora: { col: 4, linha: 29, largura: 8, altura: 16 },
    legenda: "none",
    rotulos: true,
  });
  pedir(bCiclo, {
    tipo: "coluna",
    titulo: "Ciclo de vida dos equipamentos",
    series: [{ nome: "Equipamentos", col: 2, cor: "DC2626" }],
    ancora: { col: 12, linha: 29, largura: 8, altura: 16 },
    legenda: "none",
    rotulos: true,
  });

  return comGraficos(await wb.xlsx.writeBuffer(), graficos);
}
