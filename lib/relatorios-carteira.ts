// A carteira de acordos — o que VEM, lido do Siscobra (somente leitura).
//
// O relatório da decisão 35 responde "o que fechou hoje". Este responde a
// pergunta seguinte, que é a que sustenta a carteira depois da assinatura:
// quais boletos vencem nos próximos dias, e o que já venceu sem entrar.
//
// ─────────────── a armadilha central: "paga" não é uma coluna ───────────────
//
// A parcela do acordo é limpa — `acordo_parcela` tem `acoparnum` (número),
// `acoparvallan` (valor) e `acopardatven` (vencimento). O vencimento sai daí
// direto e é confiável.
//
// O PAGAMENTO, não. Todas as colunas de nome convincente estão zeradas ou com
// data sentinela neste banco, e o ADR D-009 do projeto irmão
// (`siscobra_postgresql/docs/DECISOES.md`) as mediu uma a uma:
//
//   • `acordo_parcela.acoparvalrec` e `acoparvalrep` → 0
//   • `acordo_parcela.acoparstacal`                  → vazio
//   • `boleto.bolvalpgo`                             → 0
//   • `boleto.boldatpar` e `acordo.acodatrec`        → sentinela 0001-01-01
//   • `contrato_parcela.conparstacal = '1'` NÃO quer dizer paga (só ~2% delas
//     têm baixa; é outro código)
//
// ───────────── e o caminho óbvio pelo boleto foi MEDIDO e não serve ─────────────
//
// A primeira versão deste arquivo procurava a baixa em
// `acordo_parcela → boleto (bolcon = acocod, bolpar = acoparnum) → boleto_baixa`.
// `scripts/validar-parcelas.ts` rodou contra o CRM em 14/08/2026 e o resultado
// foi **4 casamentos em 22.801 parcelas vencidas** — 0,0%. Não é um join
// imperfeito; é um join errado.
//
// Os outros dois números da mesma medição explicam por quê, e são o que
// autoriza o desenho atual:
//
//   • `boleto_baixa` está SAUDÁVEL: 151.176 baixas, R$ 83,8M, de 2019 até
//     ontem, zero órfãs. Falta de dado não é o problema — `bolcon`/`bolpar`
//     simplesmente guardam outra coisa (a investigação continua em
//     `scripts/investigar-baixa.ts`).
//   • 95,6% dos acordos que apareceriam "em aberto" têm recebimento em
//     `operacao`, e o valor bate quase exatamente com o "em aberto" calculado:
//     R$ 12,76M contra R$ 12,75M. **As parcelas estão sendo pagas.** O painel
//     antigo teria chamado a carteira inteira de inadimplente.
//
// ──────────────────── o modelo que vale: atraso por SALDO ────────────────────
//
//     em atraso = soma das parcelas já vencidas − o que entrou no acordo
//
// É como contabilidade de recebível calcula atraso de qualquer jeito, e ele tem
// uma virtude decisiva aqui: **não precisa saber QUAL parcela foi paga**. O
// vínculo de que ele depende é `operacao.opeacocod` → `acordo.acocod`, que foi
// medido e liga (8.000 de 8.371 acordos).
//
// O recebido é alocado da parcela MAIS VELHA para a mais nova, com uma janela
// (`sum(...) OVER (PARTITION BY acocod ORDER BY acopardatven)`). É o que dá o
// aging de graça: a primeira parcela que o dinheiro não cobre é a que define há
// quanto tempo aquele saldo está vencido. Um acordo em 12x com três pagas e
// nove vencidas sai certo sem que ninguém saiba os números das três.
//
// ─────────────── a alocação corre sobre TODAS as parcelas vencidas ───────────────
//
// O recorte de `ATRASO_DIAS` escolhe os ACORDOS (os que têm parcela vencida na
// janela), e não as parcelas que entram na conta. Se ele cortasse as parcelas,
// dinheiro recebido para quitar uma parcela de dois anos atrás seria creditado
// a uma recente, e o atraso apareceria menor do que é. Os acordos são poucos
// (~8 mil); as parcelas deles, também.
//
// ─────────────────────────────── a fronteira ───────────────────────────────
//
// Tudo aqui é AGREGADO — contagem, valor, dia, faixa. Nenhum nome, CPF ou
// telefone de devedor sai destas funções, e é o que mantém o painel visível ao
// supervisor sem reabrir a decisão 27. A única exceção é `listarParcelas`, no
// fim do arquivo, que é nominal e por isso tem portão próprio
// (`exigirCarteiraNominal`, admin e cobrança — nunca supervisor).
import { consultaRelatorio } from "@/lib/siscobra";
import { diasDoIntervalo, somarDias } from "@/lib/relatorios";
import type { Periodo } from "@/lib/relatorios";
import { TIMEOUT_TELA, recorte } from "@/lib/relatorios-cobranca";
import type { Fatia, Filtro } from "@/lib/relatorios-cobranca";

export type { Fatia, Filtro };

/**
 * Quanto tempo o atraso olha para trás.
 *
 * Não é o filtro de período da tela: aging é uma foto do que está em aberto
 * AGORA, e o recorte por data quem escolhe é a faixa. Meio ano cobre o atraso
 * que ainda se trabalha; acima disso o caso já saiu da régua de cobrança e
 * viraria uma faixa "mais de 60 dias" com anos de resíduo dentro.
 */
export const ATRASO_DIAS = 180;

/** Janela dos acordos avaliados no painel de primeira parcela. */
export const PRIMEIRA_PARCELA_DIAS = 90;

/**
 * Quanto tempo de quebra o painel mostra.
 *
 * Trinta dias e não noventa porque quebra é notícia curta: serve para decidir o
 * que fazer esta semana com a carteira que está quebrando, e um trimestre
 * inteiro dilui o mês ruim na média dos dois bons.
 */
export const QUEBRAS_DIAS = 30;

const SEM_OPERADORA = "(sem operadora)";
const SEM_CARTEIRA = "(sem carteira)";

export type AVencer = {
  qtd: number;
  valor: number;
  /** As duas pontas que a operação olha primeiro. */
  hoje: { qtd: number; valor: number };
  amanha: { qtd: number; valor: number };
  porDia: Fatia[];
  porCarteira: Fatia[];
  porOperadora: Fatia[];
};

export type EmAtraso = {
  qtd: number;
  valor: number;
  /** Primeiro dia coberto pela varredura — a tela precisa dizer isto. */
  desde: string;
  porFaixa: Fatia[];
  porCarteira: Fatia[];
  porOperadora: Fatia[];
};

export type Quebras = {
  qtd: number;
  valor: number;
  porCarteira: Fatia[];
  porOperadora: Fatia[];
};

export type PrimeiraParcela = {
  /** Acordos do período cuja 1ª parcela já venceu. */
  avaliados: number;
  /** Desses, quantos têm baixa localizada na 1ª parcela. */
  pagos: number;
  valorPago: number;
  /** Por carteira: `qtd` = avaliados, `valor` = pagos. */
  porCarteira: Fatia[];
};

// ─────────────────────────── as peças repetidas ───────────────────────────
//
// Três trechos aparecem em mais de uma consulta e são escritos uma vez só. São
// constantes de módulo, interpoladas em template — texto fixo do código, nunca
// entrada de usuário; todo valor variável continua entrando por $1..$7.

/**
 * A atribuição do acordo, idêntica à do `SQL_ACORDOS` em relatorios-cobranca.ts:
 * o dono é quem teve a última ação manual com o devedor, não quem digitou.
 *
 * Aqui ela roda por ACORDO e não por parcela — de propósito. Um acordo em 12x
 * são 12 linhas em `acordo_parcela`, e rodar o LATERAL em cada uma repetiria a
 * parte cara doze vezes para chegar ao mesmo nome.
 */
const CTE_DONO = `
dono AS (
  SELECT t.acocod, COALESCE(m.retusucod, t.acousuinc) AS usucod
    FROM alvo t
    LEFT JOIN LATERAL (
      SELECT r.retusucod
        FROM retorno r
       WHERE r.devcod = t.devcod
         AND r.carcod = t.carcod
         AND r.rettip = 0
         AND r.retdatinc >= t.acodatinc - INTERVAL '30 days'
         AND r.retdatinc <  t.acodatinc + INTERVAL '1 day'
       ORDER BY r.retdatinc DESC
       LIMIT 1
    ) m ON true
)`;

/** As parcelas com baixa localizada — ver o cabeçalho sobre as quatro colunas. */
const CTE_PAGO = `
pago AS (
  SELECT bo.bolcon AS acocod, bo.bolpar AS acoparnum
    FROM boleto bo
    JOIN alvo t ON t.acocod  = bo.bolcon
               AND t.devcod  = bo.boldevcod
               AND t.carcod  = bo.bolcarcod
    JOIN boleto_baixa bb ON bb.bolcodseq = bo.bolcodseq
                        AND bb.bolbaipag > 0
   GROUP BY 1, 2
)`;

/**
 * O recorte por PESSOA — equipe ($4) e operadora ($5) —, sempre sobre o dono já
 * resolvido pelo `CTE_DONO`. Depende do alias `d` existir no escopo.
 *
 * ─────────── a armadilha do `= ANY` com nulo, dita antes de morder ───────────
 *
 * `d.usucod` pode ser NULL: é o acordo cujo operador sumiu do cadastro, que os
 * `LEFT JOIN` daqui preservam de propósito para o TOTAL não encolher em
 * silêncio. Mas `NULL = ANY(...)` devolve NULL, não `false` — então, ao filtrar
 * por operadora, esse acordo SAI.
 *
 * É o comportamento certo (quem pede "os acordos da Ana" não quer o órfão), e a
 * consequência precisa estar escrita: com filtro de operadora ligado, a soma das
 * partes pode não fechar com o total sem filtro. A diferença são os órfãos.
 */
const FILTRO_PESSOA = `($4::int[] IS NULL OR EXISTS (
        SELECT 1 FROM grupo_usuario gu
         WHERE gu.usucod = d.usucod AND gu.usugrucod = ANY($4::int[])))
      AND ($5::int[] IS NULL OR d.usucod = ANY($5::int[]))`;

// ────────────────────────────── a vencer ──────────────────────────────
//
// $1 início da janela · $2 fim · $3 carteiras · $4 equipes · $5 operadoras
//
// A chave do eixo "dia" é o DESLOCAMENTO em dias desde o início da janela, e
// não a data: chave precisa ser inteira (como a hora no relatório de acordos), e
// o deslocamento ainda ordena sozinho e diz onde o buraco está quando um dia não
// volta do banco.
const SQL_A_VENCER = `
WITH par AS (
  SELECT ap.acocod, ap.acoparvallan, ap.acopardatven,
         a.devcod, a.carcod, a.acodatinc, a.acousuinc
    FROM acordo_parcela ap
    JOIN acordo a ON a.acocod = ap.acocod
   WHERE a.acoati = 0
     AND ap.acoparvallan > 0
     AND ap.acopardatven >= $1::date
     AND ap.acopardatven <= $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
), alvo AS (
  SELECT DISTINCT acocod, devcod, carcod, acodatinc, acousuinc FROM par
),${CTE_DONO}, base AS (
  SELECT p.acoparvallan AS valor,
         d.usucod, u.usunom,
         p.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom,
         (p.acopardatven::date - $1::date)::int AS dia,
         to_char(p.acopardatven, 'DD/MM') AS dia_rotulo
    FROM par p
    JOIN dono d ON d.acocod = p.acocod
    -- LEFT e não JOIN, pelo mesmo motivo do relatório de acordos: operadora
    -- que sumiu do cadastro não pode levar a parcela embora do TOTAL.
    LEFT JOIN usuario u   ON u.usucod = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = p.carcod
   WHERE ${FILTRO_PESSOA}
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            WHEN grouping(dia)    = 0 THEN 'dia'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod
            WHEN grouping(dia)    = 0 THEN dia END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom
            WHEN grouping(dia)    = 0 THEN dia_rotulo END AS rotulo,
       count(*)::int AS qtd,
       COALESCE(sum(valor), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS ((usucod, usunom), (carcod, carnom), (dia, dia_rotulo), ())`;

// ────────────────────────────── em atraso ──────────────────────────────
//
// $1 primeiro dia da varredura · $2 hoje (exclusivo) · $3 carteiras · $4 equipes ·
// $5 operadoras
const SQL_EM_ATRASO = `
WITH par AS (
  SELECT ap.acocod, ap.acoparnum, ap.acoparvallan, ap.acopardatven,
         a.devcod, a.carcod, a.acodatinc, a.acousuinc
    FROM acordo_parcela ap
    JOIN acordo a ON a.acocod = ap.acocod
   WHERE a.acoati = 0
     AND ap.acoparvallan > 0
     AND ap.acopardatven >= $1::date
     AND ap.acopardatven <  $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
), alvo AS (
  SELECT DISTINCT acocod, devcod, carcod, acodatinc, acousuinc FROM par
),${CTE_DONO},${CTE_PAGO}, aberto AS (
  SELECT p.*
    FROM par p
    LEFT JOIN pago g ON g.acocod = p.acocod AND g.acoparnum = p.acoparnum
   WHERE g.acocod IS NULL
), base AS (
  SELECT p.acoparvallan AS valor,
         d.usucod, u.usunom,
         p.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom,
         CASE WHEN ($2::date - p.acopardatven::date) <=  7 THEN 1
              WHEN ($2::date - p.acopardatven::date) <= 15 THEN 2
              WHEN ($2::date - p.acopardatven::date) <= 30 THEN 3
              WHEN ($2::date - p.acopardatven::date) <= 60 THEN 4
              ELSE 5 END AS faixa,
         CASE WHEN ($2::date - p.acopardatven::date) <=  7 THEN '1 a 7 dias'
              WHEN ($2::date - p.acopardatven::date) <= 15 THEN '8 a 15 dias'
              WHEN ($2::date - p.acopardatven::date) <= 30 THEN '16 a 30 dias'
              WHEN ($2::date - p.acopardatven::date) <= 60 THEN '31 a 60 dias'
              ELSE 'mais de 60 dias' END AS faixa_rotulo
    FROM aberto p
    JOIN dono d ON d.acocod = p.acocod
    LEFT JOIN usuario u   ON u.usucod = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = p.carcod
   WHERE ${FILTRO_PESSOA}
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            WHEN grouping(faixa)  = 0 THEN 'faixa'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod
            WHEN grouping(faixa)  = 0 THEN faixa END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom
            WHEN grouping(faixa)  = 0 THEN faixa_rotulo END AS rotulo,
       count(*)::int AS qtd,
       COALESCE(sum(valor), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS ((usucod, usunom), (carcod, carnom), (faixa, faixa_rotulo), ())`;

// ─────────────────────────── acordos quebrados ───────────────────────────
//
// $1 início · $2 fim (por `acodatqueaco`) · $3 carteiras · $4 equipes · $5 operadoras
//
// `acoati = 1` é o acordo QUEBRADO — o mesmo flag que o relatório de produção
// EXCLUI. Aqui ele é o assunto: acordo que fecha e quebra não é produção, é
// retrabalho, e ninguém no sistema conseguia contá-lo até agora.
const SQL_QUEBRAS = `
WITH alvo AS (
  SELECT a.acocod, a.devcod, a.carcod, a.acodatinc, a.acousuinc, a.acovalatu
    FROM acordo a
   WHERE a.acoati = 1
     AND a.acodatqueaco >= $1::date
     AND a.acodatqueaco <= $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
),${CTE_DONO}, base AS (
  SELECT t.acovalatu AS valor,
         d.usucod, u.usunom,
         t.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom
    FROM alvo t
    JOIN dono d ON d.acocod = t.acocod
    LEFT JOIN usuario u   ON u.usucod = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = t.carcod
   WHERE ${FILTRO_PESSOA}
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom END AS rotulo,
       count(*)::int AS qtd,
       COALESCE(sum(valor), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS ((usucod, usunom), (carcod, carnom), ())`;

// ───────────────────────── a primeira parcela ─────────────────────────
//
// $1 início · $2 fim (por `acodatinc`, a gravação do acordo) · $3 carteiras ·
// $4 equipes · $5 operadoras · $6 hoje
//
// Por que este painel existe: a primeira parcela é o divisor entre acordo que
// vinga e acordo que só ocupou a agenda. Quem fecha muito e vê a primeira
// parcela furar está negociando valor que a pessoa não tem — e isso não aparece
// em nenhum lugar do relatório de produção, onde os dois acordos contam igual.
//
// `DISTINCT ON` pega a de menor `acoparnum`: a numeração é do próprio acordo, e
// a entrada, quando existe, é a parcela 1.
const SQL_PRIMEIRA_PARCELA = `
WITH alvo AS (
  SELECT a.acocod, a.devcod, a.carcod, a.acodatinc, a.acousuinc
    FROM acordo a
   WHERE a.acoati = 0
     AND a.acodatinc::date >= $1::date
     AND a.acodatinc::date <= $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
),${CTE_DONO},${CTE_PAGO}, pri AS (
  SELECT DISTINCT ON (ap.acocod)
         ap.acocod, ap.acoparnum, ap.acoparvallan, ap.acopardatven
    FROM acordo_parcela ap
    JOIN alvo t ON t.acocod = ap.acocod
   WHERE ap.acoparvallan > 0
   ORDER BY ap.acocod, ap.acoparnum
), base AS (
  SELECT p.acoparvallan AS valor,
         (g.acocod IS NOT NULL) AS quitada,
         t.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom
    FROM pri p
    JOIN alvo t ON t.acocod = p.acocod
    JOIN dono d ON d.acocod = p.acocod
    LEFT JOIN pago g ON g.acocod = p.acocod AND g.acoparnum = p.acoparnum
    LEFT JOIN carteira ca ON ca.carcod = t.carcod
   -- Só o que já venceu: parcela que vence semana que vem não é sinal de nada.
   WHERE p.acopardatven < $6::date
     AND ${FILTRO_PESSOA}
)
SELECT CASE WHEN grouping(carcod) = 0 THEN 'carteira' ELSE 'total' END AS eixo,
       CASE WHEN grouping(carcod) = 0 THEN carcod END::int AS chave,
       CASE WHEN grouping(carcod) = 0 THEN carnom END AS rotulo,
       count(*)::int AS qtd,
       count(*) FILTER (WHERE quitada)::int AS pagos,
       COALESCE(sum(valor) FILTER (WHERE quitada), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS ((carcod, carnom), ())`;

type LinhaEixo = {
  eixo: string;
  chave: number | null;
  rotulo: string | null;
  qtd: number;
  valor: number;
};

type LinhaPrimeira = LinhaEixo & { pagos: number };

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

/**
 * As faixas de atraso em ordem de gravidade, e não de tamanho.
 *
 * `fatias` ordena por valor, que é o certo para um ranking de operadora e o
 * errado aqui: aging lido fora de ordem perde o que ele tem de informação — a
 * forma da escada é a mensagem, não a altura do degrau maior.
 */
function faixasEmOrdem(linhas: LinhaEixo[]): Fatia[] {
  return linhas
    .filter((l) => l.eixo === "faixa")
    .map((l) => ({
      chave: l.chave,
      rotulo: l.rotulo?.trim() || "(sem faixa)",
      qtd: l.qtd,
      valor: l.valor,
    }))
    .sort((a, b) => (a.chave ?? 0) - (b.chave ?? 0));
}

/**
 * A agenda dia a dia, com os buracos preenchidos.
 *
 * Mesmo motivo da linha do tempo por hora no relatório de acordos: um dia sem
 * nenhum vencimento não volta do banco, e sem o buraco as barras vizinhas ficam
 * coladas — sexta e segunda lado a lado escondem o fim de semana, que é
 * justamente o vão que a operação precisa enxergar para não prometer cobrança
 * no sábado.
 */
function agenda(linhas: LinhaEixo[], inicio: string, fim: string): Fatia[] {
  const porDia = new Map(
    linhas.filter((l) => l.eixo === "dia").map((l) => [l.chave ?? -1, l]),
  );
  return diasDoIntervalo(inicio, fim).map((iso, i) => {
    const l = porDia.get(i);
    const [, mes, dia] = iso.split("-");
    return {
      chave: i,
      rotulo: l?.rotulo?.trim() || `${dia}/${mes}`,
      qtd: l?.qtd ?? 0,
      valor: l?.valor ?? 0,
    };
  });
}

function totalDe(linhas: LinhaEixo[]): { qtd: number; valor: number } {
  const t = linhas.find((l) => l.eixo === "total");
  return { qtd: t?.qtd ?? 0, valor: t?.valor ?? 0 };
}

/** O que vence na janela pedida. */
export async function aVencerEm(
  f: Filtro,
  hoje: string,
  timeoutMs = TIMEOUT_TELA,
): Promise<AVencer> {
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_A_VENCER,
    [f.inicio, f.fim, ...recorte(f)],
    timeoutMs,
  );
  const total = totalDe(linhas);
  const porDia = agenda(linhas, f.inicio, f.fim);
  // Hoje e amanhã são posições DENTRO da janela, não linhas separadas do banco:
  // a janela pode começar depois de hoje (recorte personalizado), e aí a
  // resposta certa é zero — não a primeira coluna do gráfico, que seria outro
  // dia com cara de hoje.
  const datas = diasDoIntervalo(f.inicio, f.fim);
  const noDia = (iso: string) => {
    const i = datas.indexOf(iso);
    return i >= 0 ? { qtd: porDia[i].qtd, valor: porDia[i].valor } : { qtd: 0, valor: 0 };
  };
  return {
    qtd: total.qtd,
    valor: total.valor,
    hoje: noDia(hoje),
    amanha: noDia(somarDias(hoje, 1)),
    porDia,
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
  };
}

/** O que venceu e não tem baixa localizada. Ver o cabeçalho do arquivo. */
export async function emAtrasoAte(
  f: Omit<Filtro, "inicio" | "fim">,
  hoje: string,
  timeoutMs = TIMEOUT_TELA,
): Promise<EmAtraso> {
  const desde = somarDias(hoje, -ATRASO_DIAS);
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_EM_ATRASO,
    [desde, hoje, ...recorte(f)],
    timeoutMs,
  );
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    valor: total.valor,
    desde,
    porFaixa: faixasEmOrdem(linhas),
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
  };
}

/**
 * Acordos que quebraram nos últimos `QUEBRAS_DIAS`.
 *
 * Não usa a janela da tela de propósito: a janela olha para frente (o que
 * vence) e quebra é passado. Somar as duas num filtro só daria um painel em que
 * mudar "próximos 30 dias" para "próximos 7" mexeria no número de quebras, que
 * não tem relação nenhuma com ele.
 */
export async function quebrasDe(
  f: Omit<Filtro, "inicio" | "fim">,
  hoje: string,
  timeoutMs = TIMEOUT_TELA,
): Promise<Quebras> {
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_QUEBRAS,
    [somarDias(hoje, -QUEBRAS_DIAS), hoje, ...recorte(f)],
    timeoutMs,
  );
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    valor: total.valor,
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
  };
}

/** Dos acordos recentes, quantos tiveram a primeira parcela honrada. */
export async function primeiraParcelaDe(
  f: Omit<Filtro, "inicio" | "fim">,
  hoje: string,
  timeoutMs = TIMEOUT_TELA,
): Promise<PrimeiraParcela> {
  const inicio = somarDias(hoje, -PRIMEIRA_PARCELA_DIAS);
  const linhas = await consultaRelatorio<LinhaPrimeira>(
    SQL_PRIMEIRA_PARCELA,
    [inicio, hoje, ...recorte(f), hoje],
    timeoutMs,
  );
  const total = linhas.find((l) => l.eixo === "total");
  return {
    avaliados: total?.qtd ?? 0,
    pagos: total?.pagos ?? 0,
    valorPago: total?.valor ?? 0,
    porCarteira: linhas
      .filter((l) => l.eixo === "carteira")
      .map((l) => ({
        chave: l.chave,
        rotulo: l.rotulo?.trim() || SEM_CARTEIRA,
        qtd: l.qtd,
        // `valor` carrega os PAGOS aqui, como no acionamento ele carrega
        // devedores distintos: a tela diz o que a segunda métrica significa.
        valor: l.pagos,
      }))
      .sort((a, b) => b.qtd - a.qtd),
  };
}

// ──────────────────────────── a lista nominal ────────────────────────────
//
// A partir daqui sai dado de devedor, e por isso só esta função é chamada por
// uma rota com portão próprio. Nada dela alimenta os painéis agregados acima.

export type ParcelaNominal = {
  acocod: number;
  devcod: number;
  parcela: number;
  nome: string;
  cpf: string;
  carteira: string;
  operadora: string | null;
  valor: number;
  vencimento: string;
  /** Dias para vencer (negativo = atrasado). */
  dias: number;
};

// $1 início · $2 fim · $3 carteiras · $4 equipes · $5 operadoras · $6 hoje ·
// $7 teto de linhas
//
// O CPF sai MASCARADO da consulta, e não da tela — mesmo desenho do `dossieDe`
// em lib/siscobra.ts. O que não trafega não vaza depois por descuido, e para
// ligar para a pessoa a operadora não precisa dos onze dígitos.
const SQL_LISTA = `
WITH par AS (
  SELECT ap.acocod, ap.acoparnum, ap.acoparvallan, ap.acopardatven,
         a.devcod, a.carcod, a.acodatinc, a.acousuinc
    FROM acordo_parcela ap
    JOIN acordo a ON a.acocod = ap.acocod
   WHERE a.acoati = 0
     AND ap.acoparvallan > 0
     AND ap.acopardatven >= $1::date
     AND ap.acopardatven <= $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
), alvo AS (
  SELECT DISTINCT acocod, devcod, carcod, acodatinc, acousuinc FROM par
),${CTE_DONO},${CTE_PAGO}
SELECT p.acocod::int, p.acoparnum::int AS parcela, p.devcod::int,
       de.devnom AS nome,
       left(lpad(de.devcpf::text, 11, '0'), 3) || '.***.***-'
         || right(lpad(de.devcpf::text, 11, '0'), 2) AS cpf,
       COALESCE(ca.carnom, ca.carnomabr) AS carteira,
       u.usunom AS operadora,
       p.acoparvallan::float8 AS valor,
       to_char(p.acopardatven, 'YYYY-MM-DD') AS vencimento,
       (p.acopardatven::date - $6::date)::int AS dias
  FROM par p
  JOIN dono d ON d.acocod = p.acocod
  LEFT JOIN pago g ON g.acocod = p.acocod AND g.acoparnum = p.acoparnum
  LEFT JOIN devedor de  ON de.devcod = p.devcod AND de.carcod = p.carcod
  LEFT JOIN carteira ca ON ca.carcod = p.carcod
  LEFT JOIN usuario u   ON u.usucod = d.usucod
 WHERE g.acocod IS NULL
   AND ${FILTRO_PESSOA}
 ORDER BY p.acopardatven, p.acoparvallan DESC
 LIMIT $7::int`;

/**
 * A lista de quem ligar — nome, CPF mascarado, valor e vencimento.
 *
 * Só as parcelas SEM baixa localizada: a lista existe para ser trabalhada, e
 * quem já pagou dentro dela é a pior falha possível deste painel.
 *
 * Teto de linhas obrigatório. Sem ele, "próximos 60 dias, todas as carteiras"
 * devolveria dezenas de milhares de nomes de devedor num JSON — e uma lista que
 * ninguém consegue ler é só exposição de dado pessoal sem uso.
 */
export async function listarParcelas(
  f: Filtro,
  hoje: string,
  limite = 300,
  timeoutMs = TIMEOUT_TELA,
): Promise<ParcelaNominal[]> {
  const linhas = await consultaRelatorio<{
    acocod: number;
    parcela: number;
    devcod: number;
    nome: string | null;
    cpf: string | null;
    carteira: string | null;
    operadora: string | null;
    valor: number;
    vencimento: string;
    dias: number;
  }>(SQL_LISTA, [f.inicio, f.fim, ...recorte(f), hoje, limite], timeoutMs);

  return linhas.map((l) => ({
    acocod: l.acocod,
    devcod: l.devcod,
    parcela: l.parcela,
    nome: l.nome?.trim() || "(sem nome no cadastro)",
    cpf: l.cpf ?? "",
    carteira: l.carteira?.trim() || SEM_CARTEIRA,
    operadora: l.operadora?.trim() || null,
    valor: l.valor,
    vencimento: l.vencimento,
    dias: l.dias,
  }));
}
