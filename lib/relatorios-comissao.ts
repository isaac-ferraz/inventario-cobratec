// A comissão da operadora — o "honorário" do pedido da decisão 39.
//
// ─────────────────── isto aqui NÃO tem o selo dos outros dois ───────────────────
//
// `relatorios-cobranca.ts` e `relatorios-carteira.ts` abrem dizendo que suas
// regras foram conferidas contra os relatórios que o próprio Siscobra imprime —
// 104 acordos em 104, acionamento em 100%. Este arquivo não pode dizer isso, e
// é importante que ele diga que não pode:
//
//   • Nenhum ADR do projeto irmão (`siscobra_postgresql/docs/DECISOES.md`)
//     trata de comissão. Nenhuma view de lá a toca.
//   • `carteira_comissoes` — a tabela que guardaria o percentual por carteira,
//     com `compercomis`/`comperacor`/`comperacio` — está VAZIA. O mesmo vale
//     para `carteira_repasse`. O percentual não é recalculável; só existe o
//     valor que o CRM já gravou.
//   • `usuario.usuperhon` (% de comissão sobre honorário) existe e nunca foi
//     lido por nada neste sistema.
//
// Por isso a medição veio antes, e valeu: `scripts/validar-comissao.ts`
// (`npm run db:validar-comissao`) rodou em 18/08/2026 e derrubou a primeira
// versão desta consulta, que atribuía por `comissao.comopecod` — 100% órfão em
// `usuario`, porque é um id sequencial e não o código do operador. O que ela
// achou está anotado no comentário do SQL.
//
// O que o script NÃO faz é comparar com o documento oficial, e é o que falta:
// enquanto ninguém conferir um mês contra o relatório de comissão que o Siscobra
// imprime, `CONFERIDA = false` mantém o aviso colado ao número.
//
// Hoje esse número só sai pela planilha — a comissão não tem tela própria, e por
// isso a `RESSALVA` viaja na aba "Parâmetros" e no resumo. Se ela ganhar painel,
// o aviso vai junto: o selo é da consulta, não do lugar onde ela é lida.
//
// Foi assim que "em atraso" nasceu na decisão 36 — dizendo "venceu e não achamos
// a baixa", e não "não pagou". Um número com o nome certo vale mais que um
// número com o nome bonito.
//
// ────────────────────────── a fonte, e o que ela é ──────────────────────────
//
// `comissao` é o evento: uma linha por parcela cuja comissão foi apurada, com
// carteira (`comcarcod`), acordo (`comacocod` + `comacoparseq`), data
// (`comdatpag`), valor pago pelo devedor (`comvalpag`) e valor da comissão
// (`comvalcom`). A operadora NÃO está aqui — ver o comentário do SQL.
//
// `comissao_operadores` traz a pessoa (`usucod`) em 3 linhas por comissão, uma
// por `comopetipo`. A repartição de VALOR que ela promete não existe:
// `comopeval` e `comopeper` estão todos zerados. Então o único valor é
// `comvalcom`, da comissão inteira, e a tela diz exatamente isso.
//
// ─────────────────────────────── a fronteira ───────────────────────────────
//
// Como nos dois módulos irmãos: só produção de funcionário. Nenhum nome, CPF ou
// telefone de devedor sai daqui — `comdevcod` existe na tabela e não é lido.
import { consultaRelatorio } from "@/lib/siscobra";
import {
  MAX_CELULAS,
  TIMEOUT_TELA,
  recorte,
  type Celula,
  type Fatia,
  type Filtro,
  type Matriz,
} from "@/lib/relatorios-cobranca";

/**
 * O selo. Vira `true` quando alguém conferir um mês desta consulta contra o
 * relatório de comissão que o Siscobra imprime — e aí o aviso some da planilha,
 * junto com esta constante.
 *
 * O que já foi medido (18/08/2026, `npm run db:validar-comissao`) está na
 * `RESSALVA` e no comentário do SQL. O que falta é a única coisa que um script
 * não faz: comparar com o documento oficial.
 */
export const CONFERIDA = false;

/**
 * O texto do aviso, em um lugar só: todo lugar que mostrar o número diz o mesmo.
 *
 * Cada frase corresponde a um número medido, não a uma precaução genérica.
 * Ressalva vaga é ruído e a pessoa aprende a pular; ressalva com número é uma
 * informação a mais sobre o próprio dado.
 */
export const RESSALVA =
  "Comissão ainda não conferida contra o relatório oficial do Siscobra " +
  "(ao contrário de acordos e acionamentos, que foram). " +
  "É a comissão inteira apurada no CRM (comvalcom) — não existe repartição por " +
  "tipo neste banco: comopeval e comopeper estão zerados, e carteira_comissoes " +
  "está vazia. A operadora vem de comissao_operadores.usucod; 14% das comissões " +
  "têm usucod fora do cadastro e caem em “(sem operadora)” (mais, em janelas " +
  "recentes), e em 3,8% delas há duas pessoas — nesses casos o " +
  "valor inteiro é creditado a uma. " +
  "Confira com `npm run db:validar-comissao`.";

const SEM_OPERADORA = "(sem operadora)";
const SEM_CARTEIRA = "(sem carteira)";

export type Comissao = {
  qtd: number;
  valor: number;
  /** O que o devedor pagou nas parcelas que geraram estas comissões. */
  recebido: number;
  porOperadora: Fatia[];
  porCarteira: Fatia[];
  porMes: Fatia[];
  matriz: Matriz;
  conferida: boolean;
  ressalva: string;
};

// $1 início · $2 fim · $3 carteiras · $4 equipes · $5 operadoras
//
// A mesma ordem posicional das sete consultas irmãs, pelo mesmo `recorte()`.
//
// O alias do dono é `d`, como nos outros módulos, para o filtro por equipe e
// operadora ser escrito uma vez e valer para todos.
//
// ─────────── a coluna óbvia é a errada, de novo (medido em 18/08/2026) ───────────
//
// A primeira versão desta consulta atribuía a comissão por `comissao.comopecod`.
// O nome diz "código do operador" e ele NÃO é isso: `npm run db:validar-comissao`
// mediu **139.842 valores distintos em 139.842 linhas** (um por linha, faixa
// 106–2.636.812) e **100% órfãos** em `usuario`. É um id sequencial da própria
// tabela.
//
// `comissao.comusuinc` também não serve: 19 valores distintos, todos válidos —
// é o pessoal do back-office que lançou o registro, não quem trabalhou o caso.
//
// A operadora está em **`comissao_operadores.usucod`**: 146 distintas, nomes
// reais (PAULA, BARBARA, LUCI CATALDI...), 88% casando com `usuario`.
//
// É a terceira vez que este projeto tropeça no mesmo tipo de armadilha —
// `acovalatu` e não `acoval`, `retusucod` e não `acousuinc`, e agora esta. O
// padrão do Siscobra é que a coluna de nome óbvio seja a errada.
//
// ──────────────── por que DISTINCT ON, e o que ele custa em precisão ────────────────
//
// São exatamente 3 linhas em `comissao_operadores` por comissão (419.526 / 139.842
// = 3,00), uma por `comopetipo` (2, 3 e 4). Somar `comvalcom` pelo join cru
// TRIPLICARIA o dinheiro.
//
// Em **96,2%** das comissões as três linhas são a MESMA pessoa, e o máximo
// observado são duas. Então uma linha por comissão resolve — e nos 3,8%
// restantes o valor inteiro vai para uma das duas, o que está dito na ressalva.
//
// `comopeval` e `comopeper` estão TODOS zerados, então não há repartição real a
// respeitar: o único valor que existe é `comvalcom`, da comissão inteira.
const SQL_COMISSAO = `
WITH ope AS (
  SELECT DISTINCT ON (co.comcod) co.comcod, co.usucod
    FROM comissao_operadores co
   ORDER BY co.comcod, co.comopetipo, co.usucod
), base AS (
  SELECT c.comvalcom AS valor,
         c.comvalpag AS recebido,
         d.usucod, u.usunom,
         c.comcarcod AS carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom,
         (extract(year from c.comdatpag) * 100
          + extract(month from c.comdatpag))::int AS mes,
         to_char(c.comdatpag, 'MM/YYYY') AS mes_rotulo
    FROM comissao c
    -- LEFT e não JOIN, pelo mesmo motivo dos outros relatórios: comissão sem
    -- operadora localizada não pode sumir do TOTAL — ela vira "(sem operadora)".
    LEFT JOIN ope d ON d.comcod = c.comcod
    LEFT JOIN usuario  u  ON u.usucod  = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = c.comcarcod
   WHERE c.comdatpag >= $1::date
     AND c.comdatpag <  $2::date + 1
     AND ($3::int[] IS NULL OR c.comcarcod = ANY($3::int[]))
     AND ($4::int[] IS NULL OR EXISTS (
           SELECT 1 FROM grupo_usuario gu
            WHERE gu.usucod = d.usucod AND gu.usugrucod = ANY($4::int[])))
     AND ($5::int[] IS NULL OR d.usucod = ANY($5::int[]))
)
SELECT CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
                                      THEN 'operadora_carteira'
            WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            WHEN grouping(mes)    = 0 THEN 'mes'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod
            WHEN grouping(mes)    = 0 THEN mes END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom
            WHEN grouping(mes)    = 0 THEN mes_rotulo END AS rotulo,
       CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
            THEN carcod END::int AS chave2,
       CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
            THEN carnom END AS rotulo2,
       count(*)::int AS qtd,
       COALESCE(sum(valor), 0)::float8 AS valor,
       COALESCE(sum(recebido), 0)::float8 AS recebido
  FROM base
 GROUP BY GROUPING SETS (
   (usucod, usunom),
   (carcod, carnom),
   (usucod, usunom, carcod, carnom),
   (mes, mes_rotulo),
   ())`;

type LinhaEixo = {
  eixo: string;
  chave: number | null;
  rotulo: string | null;
  chave2: number | null;
  rotulo2: string | null;
  qtd: number;
  valor: number;
  recebido: number;
};

function fatias(linhas: LinhaEixo[], eixo: string, semRotulo: string): Fatia[] {
  return linhas
    .filter((l) => l.eixo === eixo)
    .map((l) => ({
      chave: l.chave,
      rotulo: l.rotulo?.trim() || semRotulo,
      qtd: l.qtd,
      valor: l.valor,
    }))
    .sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);
}

export async function comissaoDe(
  f: Filtro,
  timeoutMs = TIMEOUT_TELA,
): Promise<Comissao> {
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_COMISSAO,
    [f.inicio, f.fim, ...recorte(f)],
    timeoutMs,
  );

  const total = linhas.find((l) => l.eixo === "total");

  const celulas: Celula[] = linhas
    .filter((l) => l.eixo === "operadora_carteira")
    .map((l) => ({
      operadora: l.chave,
      operadoraNome: l.rotulo?.trim() || SEM_OPERADORA,
      carteira: l.chave2,
      carteiraNome: l.rotulo2?.trim() || SEM_CARTEIRA,
      qtd: l.qtd,
      valor: l.valor,
    }))
    .sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);

  return {
    qtd: total?.qtd ?? 0,
    valor: total?.valor ?? 0,
    recebido: total?.recebido ?? 0,
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porMes: linhas
      .filter((l) => l.eixo === "mes")
      .map((l) => ({
        chave: l.chave,
        rotulo: l.rotulo?.trim() || "(sem mês)",
        qtd: l.qtd,
        valor: l.valor,
      }))
      .sort((a, b) => (a.chave ?? 0) - (b.chave ?? 0)),
    matriz: {
      celulas: celulas.slice(0, MAX_CELULAS),
      truncada: celulas.length > MAX_CELULAS,
    },
    conferida: CONFERIDA,
    ressalva: RESSALVA,
  };
}

/**
 * A comissão existe neste banco?
 *
 * A tabela é de um módulo do Siscobra que pode não estar instalado, e a consulta
 * falharia com "relation does not exist" — um 502 que se lê como "o CRM caiu".
 * Uma pergunta ao catálogo custa nada e transforma isso em "esta instalação não
 * tem comissão", que é acionável.
 *
 * O resultado não muda em produção; fica em memória pela vida do processo.
 */
let temTabela: boolean | null = null;

export async function comissaoDisponivel(): Promise<boolean> {
  if (temTabela !== null) return temTabela;
  try {
    const linhas = await consultaRelatorio<{ existe: boolean }>(
      `SELECT to_regclass('public.comissao') IS NOT NULL AS existe`,
      [],
      5_000,
    );
    temTabela = linhas[0]?.existe === true;
  } catch {
    // Falha de rede não é ausência de tabela — não gravar deixa a próxima
    // chamada tentar de novo, em vez de desligar a aba até o restart.
    return false;
  }
  return temTabela;
}
