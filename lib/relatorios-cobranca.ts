// As consultas do relatório de cobrança — a produção da operação, lida do
// Siscobra (CRM, PostgreSQL, SOMENTE LEITURA).
//
// ──────────────────── as regras aqui não foram inventadas ────────────────────
//
// Cada uma foi validada, linha a linha, contra os relatórios oficiais que o
// próprio Siscobra imprime em PDF. A investigação está no projeto irmão
// `siscobra_postgresql` (docs/DECISOES.md); o que interessa saber ao ler este
// arquivo é que **as colunas óbvias são as erradas**:
//
//   • ACORDO conta `acoati = 0` (o `1` é QUEBRADO, e o oficial o exclui);
//     o valor é `acovalatu` (total com juros/multa = "Vlr aberto acordo"), NÃO
//     `acoval`, que é só o principal e subconta; e o período vai por
//     `acodatinc` (gravação real), NÃO `acodatcad` — em carteira recorrente o
//     `acodatcad` é a data da PARCELA e faz o acordo sumir do dia em que foi
//     fechado.  (D-002, conferido acordo a acordo: 104/104.)
//
//   • A ATRIBUIÇÃO do acordo é a parte contraintuitiva: ele NÃO é de quem
//     gravou (`acousuinc`), e sim de quem teve a **última ação manual** com
//     aquele devedor naquela carteira (`retorno.retusucod`, janela de 30 dias).
//     É regra de negócio da casa: quando um finalizador grava em nome da
//     negociadora, o crédito é de quem trabalhou o caso. Sem isso, três nomes
//     apareceriam com a produção do time inteiro.
//
//   • ACIONAMENTO é `retorno` com `rettip = 0` (manual). `rettip = 7` é o
//     retorno automático do discador e são ~95% das 55M linhas — contá-lo
//     multiplicaria tudo por vinte. E o dono da ação é `usucod`, não
//     `retusucod` (que é quem digitou): trocar os dois derruba a conferência
//     de 100% para ~97%.  (D-001.)
//
// Note que acordo e acionamento usam colunas de usuário TROCADAS entre si —
// `retusucod` para o acordo, `usucod` para o acionamento. Parece engano e não
// é: no acordo se quer o *responsável* pelo devedor; no acionamento, o *autor*
// da ação. As duas foram medidas contra o PDF.
//
// ─────────────────────────────── a fronteira ───────────────────────────────
//
// Isto agrega PRODUÇÃO DE FUNCIONÁRIO: contagem, valor, hora, situação. Nenhum
// dado de devedor sai daqui — sem nome, sem CPF, sem telefone, sem contrato.
// É o que torna o relatório visível ao supervisor sem repetir a discussão de
// LGPD da decisão 27; o painel responde "quanto a equipe produziu", nunca
// "quem deve o quê".
import { consultaRelatorio } from "@/lib/siscobra";
import type { Periodo } from "@/lib/relatorios";

// ───────────────────────── o filtro aceita mais de um ─────────────────────────
//
// Decisão 39: cada recorte é uma LISTA, não uma escolha. `null` continua
// significando "todas" — e é o que faz a cláusula sumir da consulta em vez de
// virar um `IN` com as 191 carteiras dentro.
//
// A armadilha do `= ANY` está anotada onde ela morde, em `FILTRO_PESSOA`.
export type Filtro = Periodo & {
  /** Carteiras (`carcod`); null = todas. */
  carteiras: number[] | null;
  /** Equipes (`grupo.usugrucod`); null = todas. */
  equipes: number[] | null;
  /** Operadoras (`usuario.usucod`); null = todas. */
  operadoras: number[] | null;
};

/**
 * "A operação inteira, sem recorte."
 *
 * Existe como constante para os chamadores que nunca filtram — o digest e o
 * fechamento do relógio (decisão 37), que medem a empresa toda. Escrever os três
 * nulos à mão em cada um deles é o tipo de repetição que sobrevive à próxima
 * mudança de forma do filtro pela metade.
 */
export const SEM_RECORTE = {
  carteiras: null,
  equipes: null,
  operadoras: null,
} as const;

export type Fatia = {
  chave: number | null;
  rotulo: string;
  qtd: number;
  valor: number;
};

/**
 * Uma célula do cruzamento operadora × carteira.
 *
 * O painel sempre soube dizer quanto cada operadora fez e quanto cada carteira
 * rendeu, nunca quanto a Ana fez NA carteira X — que é a pergunta que a gestão
 * faz para remanejar gente entre carteiras. É o mesmo `GROUPING SETS`, com um
 * conjunto a mais: uma varredura, não duas.
 */
export type Celula = {
  operadora: number | null;
  operadoraNome: string;
  carteira: number | null;
  carteiraNome: string;
  qtd: number;
  valor: number;
};

/**
 * Teto de células da matriz.
 *
 * 353 operadoras × 191 carteiras é um teto teórico de 67 mil linhas; o real é a
 * interseção que trabalhou no período, mas "período grande sem filtro" chega
 * perto o bastante para travar a tela. Truncar é aceitável; truncar em SILÊNCIO
 * não é — a resposta carrega `truncada`, como a lista nominal já faz.
 */
export const MAX_CELULAS = 5_000;

/**
 * Timeout padrão das consultas de relatório — o mesmo que as telas usam.
 *
 * A exportação (decisão 39) passa um valor maior: uma planilha de oito abas roda
 * sem ninguém olhando, e derrubá-la em 30s obrigaria a pessoa a repetir o pedido
 * inteiro por causa da aba mais lenta.
 */
export const TIMEOUT_TELA = 30_000;


export type Matriz = { celulas: Celula[]; truncada: boolean };

export type Acordos = {
  qtd: number;
  valor: number;
  porOperadora: Fatia[];
  porCarteira: Fatia[];
  porHora: Fatia[];
  porMes: Fatia[];
  matriz: Matriz;
};

export type Acionamentos = {
  qtd: number;
  devedores: number;
  porOperadora: Fatia[];
  porSituacao: Fatia[];
  porHora: Fatia[];
  porMes: Fatia[];
};

export type Equipe = { cod: number; nome: string; membros: number };
export type Carteira = { cod: number; nome: string };
export type Operadora = { cod: number; nome: string; equipe: string | null };

const SEM_OPERADORA = "(sem operadora)";
const SEM_CARTEIRA = "(sem carteira)";
const SEM_SITUACAO = "(sem situação)";

// ─────────────────────────── por que GROUPING SETS ───────────────────────────
//
// A tela mostra o mesmo conjunto de acordos por três eixos (operadora, carteira
// e hora) mais o total. Três consultas seriam três varreduras — e, no caso do
// acordo, três vezes o LATERAL de atribuição, que é a parte cara. Com GROUPING
// SETS o banco varre uma vez e devolve os quatro recortes empilhados, com uma
// coluna dizendo de qual eixo é cada linha.
//
// O `CASE ... grouping(x)` é explícito em vez de um `coalesce` esperto porque
// hora ZERO é um valor legítimo e chave nula também: coalesce escolheria a
// coluna errada em silêncio, e o gráfico ganharia uma barra fantasma.
//
// ─────────────── a ordem dos ramos do CASE não é decorativa ───────────────
//
// O conjunto (usucod, carcod) — a matriz — tem `grouping` ZERO nas DUAS colunas.
// Se o ramo dele não vier primeiro, ele cai no ramo de 'operadora' e a matriz
// inteira é lida como um ranking de operadoras com os valores repartidos por
// carteira: os números somam certo e o rótulo mente. O ramo composto é o
// primeiro de propósito.
//
// ───────────────── o mês é chave inteira, como a hora ─────────────────
//
// `202608` e não `'2026-08'`: `chave` é `int` no contrato de `Fatia`, e um
// inteiro assim ordena sozinho sem parsear texto. O rótulo legível vai à parte.

const SQL_ACORDOS = `
WITH aco AS (
  SELECT a.acocod, a.devcod, a.carcod, a.acodatinc, a.acovalatu, a.acousuinc
    FROM acordo a
   WHERE a.acoati = 0
     AND a.acodatinc::date >= $1::date
     AND a.acodatinc::date <= $2::date
     AND ($3::int[] IS NULL OR a.carcod = ANY($3::int[]))
), dono AS (
  SELECT a.acocod, a.carcod, a.acodatinc, a.acovalatu,
         COALESCE(m.retusucod, a.acousuinc) AS usucod
    FROM aco a
    LEFT JOIN LATERAL (
      SELECT r.retusucod
        FROM retorno r
       WHERE r.devcod = a.devcod
         AND r.carcod = a.carcod
         AND r.rettip = 0
         AND r.retdatinc >= a.acodatinc - INTERVAL '30 days'
         AND r.retdatinc <  a.acodatinc + INTERVAL '1 day'
       ORDER BY r.retdatinc DESC
       LIMIT 1
    ) m ON true
), base AS (
  SELECT d.acovalatu, d.usucod, u.usunom,
         d.carcod, COALESCE(ca.carnom, ca.carnomabr) AS carnom,
         extract(hour from d.acodatinc)::int AS hora,
         (extract(year from d.acodatinc) * 100
          + extract(month from d.acodatinc))::int AS mes,
         to_char(d.acodatinc, 'MM/YYYY') AS mes_rotulo
    FROM dono d
    -- LEFT e não JOIN: com o inner, um acordo cujo operador sumiu do cadastro
    -- desapareceria da CONTAGEM TOTAL também, e o número grande da tela
    -- encolheria sem que ninguém percebesse. Aqui ele vira "(sem operadora)".
    LEFT JOIN usuario u  ON u.usucod = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = d.carcod
   WHERE ($4::int[] IS NULL OR EXISTS (
           SELECT 1 FROM grupo_usuario gu
            WHERE gu.usucod = d.usucod AND gu.usugrucod = ANY($4::int[])))
     AND ($5::int[] IS NULL OR d.usucod = ANY($5::int[]))
)
SELECT CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
                                      THEN 'operadora_carteira'
            WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            WHEN grouping(mes)    = 0 THEN 'mes'
            WHEN grouping(hora)   = 0 THEN 'hora'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod
            WHEN grouping(mes)    = 0 THEN mes
            WHEN grouping(hora)   = 0 THEN hora END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom
            WHEN grouping(mes)    = 0 THEN mes_rotulo END AS rotulo,
       -- A segunda chave só existe na matriz: nos outros eixos ela é nula e o
       -- leitor a ignora. É mais barato que uma consulta separada só para o
       -- cruzamento, que repetiria o LATERAL de atribuição inteiro.
       CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
            THEN carcod END::int AS chave2,
       CASE WHEN grouping(usucod) = 0 AND grouping(carcod) = 0
            THEN carnom END AS rotulo2,
       count(*)::int AS qtd,
       COALESCE(sum(acovalatu), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS (
   (usucod, usunom),
   (carcod, carnom),
   (usucod, usunom, carcod, carnom),
   (mes, mes_rotulo),
   (hora),
   ())`;

const SQL_ACIONAMENTOS = `
WITH base AS (
  SELECT r.usucod, u.usunom, r.devcod, cs.sitnom,
         extract(hour from r.retdatinc)::int AS hora,
         (extract(year from r.retdatinc) * 100
          + extract(month from r.retdatinc))::int AS mes,
         to_char(r.retdatinc, 'MM/YYYY') AS mes_rotulo
    FROM retorno r
    LEFT JOIN usuario u ON u.usucod = r.usucod
    -- (carcod, sitcod) é único em carteira_situacao (conferido): o LEFT JOIN
    -- não multiplica linha e a contagem continua sendo de ações, não de pares.
    --
    -- O cs.carcod = r.carcod NÃO é redundante, e não pode ser removido para
    -- "bater com o relatório impresso": o nome da situação é POR CARTEIRA. O
    -- código 3 é "LIGAÇÃO - DESEMPREGADO" na FESTCARD e "RECADO" na COOP
    -- SESC/SENAC; o código 25 tem SETE nomes diferentes em 85 carteiras.
    --
    -- O "Relatório Analítico da Carteira" do próprio Siscobra resolve o nome
    -- sem essa amarração e acaba usando o do MENOR carcod que define o código —
    -- conferido em 19/08/2026 sobre as 143 carteiras ativas, 17/17 dos códigos
    -- testados. Ou seja: o relatório oficial rotula errado, com as contagens
    -- certas. Aqui está certo, e é para continuar assim (decisão 40).
    LEFT JOIN carteira_situacao cs
           ON cs.carcod = r.carcod AND cs.sitcod = r.sitcod
   WHERE r.rettip = 0
     -- retdatinc é timestamp: "< dia seguinte" inclui o dia final inteiro.
     AND r.retdatinc >= $1::date
     AND r.retdatinc <  $2::date + 1
     AND ($3::int[] IS NULL OR r.carcod = ANY($3::int[]))
     AND ($4::int[] IS NULL OR EXISTS (
           SELECT 1 FROM grupo_usuario gu
            WHERE gu.usucod = r.usucod AND gu.usugrucod = ANY($4::int[])))
     -- No acionamento o dono é \`usucod\` (autor da ação) e não \`retusucod\`
     -- (quem digitou) — as duas colunas seguem trocadas entre acordo e
     -- acionamento, como o cabeçalho deste arquivo explica.
     AND ($5::int[] IS NULL OR r.usucod = ANY($5::int[]))
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(sitnom) = 0 THEN 'situacao'
            WHEN grouping(mes)    = 0 THEN 'mes'
            WHEN grouping(hora)   = 0 THEN 'hora'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(mes)    = 0 THEN mes
            WHEN grouping(hora)   = 0 THEN hora END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(sitnom) = 0 THEN sitnom
            WHEN grouping(mes)    = 0 THEN mes_rotulo END AS rotulo,
       NULL::int AS chave2,
       NULL::text AS rotulo2,
       count(*)::int AS qtd,
       count(DISTINCT devcod)::int AS valor
  FROM base
 GROUP BY GROUPING SETS (
   (usucod, usunom), (sitnom), (mes, mes_rotulo), (hora), ())`;

type LinhaEixo = {
  eixo: string;
  chave: number | null;
  rotulo: string | null;
  chave2: number | null;
  rotulo2: string | null;
  qtd: number;
  valor: number;
};

function fatias(
  linhas: LinhaEixo[],
  eixo: string,
  semRotulo: string,
): Fatia[] {
  return linhas
    .filter((l) => l.eixo === eixo)
    .map((l) => ({
      chave: l.chave,
      rotulo: l.rotulo?.trim() || semRotulo,
      qtd: l.qtd,
      valor: l.valor,
    }))
    .sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
}

/**
 * As horas viram uma linha do tempo contínua, com os buracos preenchidos.
 *
 * Sem isso o gráfico "acordo hora a hora" mentiria pela forma: uma hora sem
 * nenhum acordo simplesmente não voltaria do banco, e as barras vizinhas
 * ficariam coladas — 9h e 14h lado a lado parecem duas horas seguidas. O
 * silêncio das 12h é justamente uma das informações que o gestor procura.
 */
function linhaDoTempo(linhas: LinhaEixo[]): Fatia[] {
  const porHora = new Map(
    linhas.filter((l) => l.eixo === "hora").map((l) => [l.chave ?? -1, l]),
  );
  const horas = [...porHora.keys()].filter((h) => h >= 0);
  if (horas.length === 0) return [];
  // A janela é a do expediente OBSERVADO, não um 0–23 fixo: o gráfico do dia
  // não precisa de catorze colunas vazias de madrugada para provar que ninguém
  // trabalhou às 3h.
  const inicio = Math.min(...horas);
  const fim = Math.max(...horas);
  const faixa: Fatia[] = [];
  for (let h = inicio; h <= fim; h++) {
    const l = porHora.get(h);
    faixa.push({
      chave: h,
      rotulo: `${String(h).padStart(2, "0")}h`,
      qtd: l?.qtd ?? 0,
      valor: l?.valor ?? 0,
    });
  }
  return faixa;
}

/**
 * A série mensal, em ordem de calendário.
 *
 * Sem preencher buraco, ao contrário da linha do tempo por hora: o rótulo aqui é
 * "08/2026", que diz de qual mês é cada barra sem depender da posição. O que
 * engana em hora ("9h" ao lado de "14h" parecem seguidos) não engana em mês.
 *
 * Dentro do teto de 92 dias isto rende até quatro baldes. É pouco para "o ano" —
 * e é o que o teto do CRM de produção permite (decisão 39).
 */
function serieMensal(linhas: LinhaEixo[]): Fatia[] {
  return linhas
    .filter((l) => l.eixo === "mes")
    .map((l) => ({
      chave: l.chave,
      rotulo: l.rotulo?.trim() || "(sem mês)",
      qtd: l.qtd,
      valor: l.valor,
    }))
    .sort((a, b) => (a.chave ?? 0) - (b.chave ?? 0));
}

/**
 * O cruzamento operadora × carteira, com teto.
 *
 * Ordena por valor porque a pergunta é "onde está o dinheiro desta pessoa"; o
 * corte cai na cauda, que é onde ele dói menos. `truncada` sobe até a tela: uma
 * matriz cortada em silêncio lê como "é tudo isso".
 */
function matrizDe(linhas: LinhaEixo[]): Matriz {
  const todas = linhas
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
    celulas: todas.slice(0, MAX_CELULAS),
    truncada: todas.length > MAX_CELULAS,
  };
}

function totalDe(linhas: LinhaEixo[]): { qtd: number; valor: number } {
  const t = linhas.find((l) => l.eixo === "total");
  return { qtd: t?.qtd ?? 0, valor: t?.valor ?? 0 };
}

/**
 * Os parâmetros do recorte, na ordem que todas as consultas usam.
 *
 * Uma função e não quatro literais espalhados: a ordem posicional de `$3`, `$4`
 * e `$5` é a mesma em sete consultas, e trocar duas de lugar não dá erro
 * nenhum — dá um relatório filtrado pela coluna errada.
 */
export function recorte(
  f: Omit<Filtro, "inicio" | "fim">,
): [number[] | null, number[] | null, number[] | null] {
  return [f.carteiras, f.equipes, f.operadoras];
}

export async function acordosDo(
  f: Filtro,
  timeoutMs = TIMEOUT_TELA,
): Promise<Acordos> {
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_ACORDOS,
    [f.inicio, f.fim, ...recorte(f)],
    timeoutMs,
  );
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    valor: total.valor,
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porHora: linhaDoTempo(linhas),
    porMes: serieMensal(linhas),
    matriz: matrizDe(linhas),
  };
}

export async function acionamentosDe(
  f: Filtro,
  timeoutMs = TIMEOUT_TELA,
): Promise<Acionamentos> {
  const linhas = await consultaRelatorio<LinhaEixo>(
    SQL_ACIONAMENTOS,
    [f.inicio, f.fim, ...recorte(f)],
    timeoutMs,
  );
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    // No acionamento a coluna "valor" carrega DEVEDORES DISTINTOS: 300 ações
    // em 30 pessoas é uma tarde muito diferente de 300 ações em 300 pessoas.
    devedores: total.valor,
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
    porSituacao: fatias(linhas, "situacao", SEM_SITUACAO),
    porHora: linhaDoTempo(linhas),
    porMes: serieMensal(linhas),
  };
}

// ─────────────────────────── o que fica em memória ───────────────────────────
//
// Só as LISTAS DOS FILTROS. Elas custam caro (a de carteiras varre `acordo` de
// um ano: ~2,6s) e mudam quando alguém cadastra uma carteira nova — uma vez por
// semana, no máximo.
//
// Os NÚMEROS do relatório não entram aqui de propósito. A primeira pergunta da
// tela é "quantos acordos até agora?", e um cache de um minuto responderia com
// o número de um minuto atrás no exato momento em que a operadora fecha o
// acordo e o gestor olha para conferir. Painel que atrasa é pior que painel
// lento. Quem protege o CRM do excesso é o teto de MAX_DIAS, não o cache.
//
// Vale por instância do app (mesma limitação anotada em `chat-eventos.ts`).
const VALIDADE_LISTA_MS = 60 * 60 * 1000;
const memoria = new Map<string, { em: number; dados: unknown }>();

async function lembrando<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
  const guardado = memoria.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE_LISTA_MS) {
    return guardado.dados as T;
  }
  const dados = await buscar();
  memoria.set(chave, { em: Date.now(), dados });
  return dados;
}

/**
 * As equipes do Siscobra — só as que têm gente dentro.
 *
 * O banco tem 33 grupos e a maioria é legado sem nenhum membro; oferecer todos
 * no filtro seria oferecer 16 maneiras de ver uma tela vazia. Nomes se repetem
 * ("COOPERATIVAS" é 15 e 21), então quem escolhe é o CÓDIGO — a tela mostra o
 * número ao lado quando o nome se repete.
 */
export async function equipes(): Promise<Equipe[]> {
  return lembrando("equipes", async () => {
    const linhas = await consultaRelatorio<{
      cod: number;
      nome: string | null;
      membros: number;
    }>(
      `SELECT g.usugrucod::int AS cod,
              g.usugrunom       AS nome,
              count(gu.usucod)::int AS membros
         FROM grupo g
         JOIN grupo_usuario gu ON gu.usugrucod = g.usugrucod
        GROUP BY 1, 2
        ORDER BY 2`,
      [],
      10_000,
    );
    return linhas.map((l) => ({
      cod: l.cod,
      nome: l.nome?.trim() || `Equipe ${l.cod}`,
      membros: l.membros,
    }));
  });
}

/**
 * As carteiras que tiveram acordo no último ano.
 *
 * "Todas" seriam centenas, quase todas encerradas há anos. O corte de 12 meses
 * é o que faz o seletor caber na tela — e ele mira acordo (e não contrato) de
 * propósito: carteira sem acordo nenhum no ano não tem o que mostrar neste
 * relatório.
 */
export async function carteiras(): Promise<Carteira[]> {
  return lembrando("carteiras", async () => {
    const linhas = await consultaRelatorio<{ cod: number; nome: string | null }>(
      `SELECT c.carcod::int AS cod,
              COALESCE(c.carnom, c.carnomabr) AS nome
         FROM carteira c
        WHERE EXISTS (
              SELECT 1 FROM acordo a
               WHERE a.carcod = c.carcod
                 AND a.acoati = 0
                 AND a.acodatinc > now() - interval '12 months')
        ORDER BY 2`,
      [],
      20_000,
    );
    return linhas.map((l) => ({
      cod: l.cod,
      nome: l.nome?.trim() || `Carteira ${l.cod}`,
    }));
  });
}

/**
 * As operadoras, com a equipe ao lado.
 *
 * ─────────────── por que a lista NÃO é filtrada por atividade ───────────────
 *
 * As duas listas vizinhas cortam pelo que produziu: carteira precisa ter acordo
 * no ano, equipe precisa ter membro. Aqui o corte equivalente seria "quem
 * acionou nos últimos meses", e ele custa uma varredura em `retorno` — 55
 * milhões de linhas para desenhar um seletor. Também não dá para usar
 * `usuario.usuatiina` sem saber de que lado o flag liga, e adivinhar a polaridade
 * de uma coluna do CRM é exatamente o que este projeto não faz.
 *
 * Então vêm as 353, ordenadas por nome, e quem separa é a busca do seletor. A
 * equipe vai junto como nota justamente para isso: "EQUIPE AZUL" ao lado do nome
 * é o que distingue a operadora atual da homônima que saiu em 2019.
 *
 * `string_agg` e não `JOIN` porque um operador pode estar em mais de um grupo —
 * é a mesma razão de o filtro de equipe ser `EXISTS` e não join.
 */
export async function operadoras(): Promise<Operadora[]> {
  return lembrando("operadoras", async () => {
    const linhas = await consultaRelatorio<{
      cod: number;
      nome: string | null;
      equipe: string | null;
    }>(
      `SELECT u.usucod::int AS cod,
              u.usunom       AS nome,
              string_agg(DISTINCT g.usugrunom, ', ' ORDER BY g.usugrunom) AS equipe
         FROM usuario u
         LEFT JOIN grupo_usuario gu ON gu.usucod = u.usucod
         LEFT JOIN grupo g          ON g.usugrucod = gu.usugrucod
        GROUP BY 1, 2
        ORDER BY 2`,
      [],
      10_000,
    );
    return linhas.map((l) => ({
      cod: l.cod,
      nome: l.nome?.trim() || `Operadora ${l.cod}`,
      equipe: l.equipe?.trim() || null,
    }));
  });
}
