// O catálogo de abas da planilha de relatórios (decisão 39).
//
// ────────────────── por que separado de `lib/excel-relatorios.ts` ──────────────────
//
// Este módulo é lido por TRÊS lados: a rota (para autorizar), o gerador (para
// montar) e o DIÁLOGO NO NAVEGADOR (para desenhar as caixinhas). O gerador
// importa `exceljs`, que tem centenas de kB — deixar o catálogo lá dentro
// arrastaria a biblioteca inteira para o bundle do cliente por causa de uma
// lista de dezessete objetos.
//
// A separação também tem um efeito que vale por si: a lista de quem-pode-o-quê
// fica em um lugar só, e a caixinha que a tela desenha é exatamente a aba que a
// rota autoriza. Duas listas divergiriam, e o sintoma seria uma opção que sempre
// devolve 403 — o mesmo tipo de defeito da decisão 25.1.

export type Papel = "ADMIN" | "SUPERVISOR" | "COBRANCA" | "OPERADOR";

/**
 * De onde cada aba tira o número.
 *
 * A separação existe para a rota consultar cada fonte UMA vez, mesmo quando
 * quatro abas dependem dela. "Acordos por operadora", "por carteira", "por hora"
 * e a matriz saem todas do mesmo `GROUPING SETS`.
 */
export type Fonte =
  | "acordos"
  | "acionamentos"
  | "aVencer"
  | "atraso"
  | "quebras"
  | "primeira"
  | "comissao"
  | "parcelas";

export type AbaChave =
  | "parametros"
  | "resumo"
  | "acordos-operadora"
  | "acordos-carteira"
  | "acordos-matriz"
  | "painel-interativo"
  | "acordos-mes"
  | "acordos-hora"
  | "acionamentos-operadora"
  | "acionamentos-situacao"
  | "comissao"
  | "comissao-matriz"
  | "carteira-a-vencer"
  | "carteira-atraso"
  | "carteira-quebras"
  | "carteira-primeira"
  | "carteira-operadora"
  | "parcelas";

export type DefinicaoAba = {
  chave: AbaChave;
  /** Nome da aba dentro do arquivo. Máx. 31 caracteres — limite do Excel. */
  nome: string;
  /** O que a pessoa lê no diálogo. */
  descricao: string;
  papeis: Papel[];
  fontes: Fonte[];
  /** Marcada por padrão no diálogo. */
  padrao: boolean;
};

const TODOS_DO_RELATORIO: Papel[] = ["ADMIN", "SUPERVISOR"];
const COM_A_COBRANCA: Papel[] = ["ADMIN", "SUPERVISOR", "COBRANCA"];
const SO_NOMINAL: Papel[] = ["ADMIN", "COBRANCA"];

export const ABAS: DefinicaoAba[] = [
  {
    chave: "parametros",
    nome: "Parâmetros",
    descricao: "O recorte que gerou os números, quem exportou e as ressalvas de método.",
    papeis: COM_A_COBRANCA,
    fontes: [],
    padrao: true,
  },
  {
    chave: "resumo",
    nome: "Resumo",
    descricao: "Os indicadores de abertura das abas escolhidas, com barra de dados.",
    papeis: COM_A_COBRANCA,
    fontes: [],
    padrao: true,
  },
  {
    chave: "acordos-operadora",
    nome: "Acordos · operadora",
    descricao: "Quantidade e valor por operadora, no período.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: true,
  },
  {
    chave: "acordos-carteira",
    nome: "Acordos · carteira",
    descricao: "Quantidade e valor por carteira, no período.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: true,
  },
  {
    chave: "acordos-matriz",
    nome: "Acordos · oper × carteira",
    descricao: "O cruzamento: quanto cada operadora fez em cada carteira.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: true,
  },
  {
    chave: "painel-interativo",
    nome: "Painel interativo",
    descricao:
      "Duas abas: a tabela operadora × carteira e um painel com filtros de " +
      "clique (slicers). Os cartões e os gráficos acompanham o filtro dentro " +
      "do próprio arquivo, sem voltar ao site.",
    // O mesmo portão da matriz: o painel mostra nome de operadora, e a decisão
    // 36 nega esse ranking à cobrança. Aba nova com papel mais frouxo que o do
    // dado que ela carrega seria a porta dos fundos da 39.
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: false,
  },
  {
    chave: "acordos-mes",
    nome: "Acordos · mês",
    descricao: "Série mensal dentro do período (teto de 92 dias).",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: false,
  },
  {
    chave: "acordos-hora",
    nome: "Acordos · hora",
    descricao: "Distribuição pelo expediente.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acordos"],
    padrao: false,
  },
  {
    chave: "acionamentos-operadora",
    nome: "Acionamentos · operadora",
    descricao: "Ações manuais e devedores distintos por operadora.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acionamentos"],
    padrao: true,
  },
  {
    chave: "acionamentos-situacao",
    nome: "Acionamentos · situação",
    descricao: "O mesmo corte do relatório “Ação de…” do Siscobra.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["acionamentos"],
    padrao: false,
  },
  {
    chave: "comissao",
    nome: "Comissão · operadora",
    descricao:
      "Comissão apurada por operadora e por mês. Não conferida contra o Siscobra — ver a aba Parâmetros.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["comissao"],
    padrao: false,
  },
  {
    chave: "comissao-matriz",
    nome: "Comissão · oper × carteira",
    descricao: "A comissão cruzada por carteira — o pedido de “honorários por carteira”.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["comissao"],
    padrao: false,
  },
  {
    chave: "carteira-a-vencer",
    nome: "Carteira · a vencer",
    descricao: "Agenda dia a dia da janela escolhida.",
    papeis: COM_A_COBRANCA,
    fontes: ["aVencer"],
    padrao: false,
  },
  {
    chave: "carteira-atraso",
    nome: "Carteira · em atraso",
    descricao: "Faixas de aging. “Em atraso” = venceu e não achamos a baixa.",
    papeis: COM_A_COBRANCA,
    fontes: ["atraso"],
    padrao: false,
  },
  {
    chave: "carteira-quebras",
    nome: "Carteira · quebras",
    descricao: "Acordos quebrados nos últimos 30 dias.",
    papeis: COM_A_COBRANCA,
    fontes: ["quebras"],
    padrao: false,
  },
  {
    chave: "carteira-primeira",
    nome: "Carteira · 1ª parcela",
    descricao: "Dos acordos recentes, quantos tiveram a primeira parcela honrada.",
    papeis: COM_A_COBRANCA,
    fontes: ["primeira"],
    padrao: false,
  },
  {
    chave: "carteira-operadora",
    nome: "Carteira · operadora",
    descricao: "A vencer, atraso e quebras por operadora.",
    papeis: TODOS_DO_RELATORIO,
    fontes: ["aVencer", "atraso", "quebras"],
    padrao: false,
  },
  {
    chave: "parcelas",
    nome: "Parcelas (nominal)",
    descricao:
      "Nome do devedor, CPF mascarado, valor e vencimento. Teto de 300 linhas.",
    papeis: SO_NOMINAL,
    fontes: ["parcelas"],
    padrao: false,
  },
];

const PORCHAVE = new Map(ABAS.map((a) => [a.chave, a]));

export function abaDe(chave: string): DefinicaoAba | undefined {
  return PORCHAVE.get(chave as AbaChave);
}

/** As abas que este papel pode pedir — o que o diálogo desenha. */
export function abasDoPapel(papel: Papel): DefinicaoAba[] {
  return ABAS.filter((a) => a.papeis.includes(papel));
}

/** As fontes que precisam ser consultadas para um conjunto de abas. */
export function fontesDe(chaves: AbaChave[]): Fonte[] {
  const s = new Set<Fonte>();
  for (const c of chaves) for (const f of abaDe(c)?.fontes ?? []) s.add(f);
  return [...s];
}
