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

export type Filtro = Periodo & {
  /** Carteira (`carcod`); null = todas. */
  carteira: number | null;
  /** Equipe (`grupo.usugrucod`); null = todas. */
  equipe: number | null;
};

export type Fatia = {
  chave: number | null;
  rotulo: string;
  qtd: number;
  valor: number;
};

export type Acordos = {
  qtd: number;
  valor: number;
  porOperadora: Fatia[];
  porCarteira: Fatia[];
  porHora: Fatia[];
};

export type Acionamentos = {
  qtd: number;
  devedores: number;
  porOperadora: Fatia[];
  porSituacao: Fatia[];
  porHora: Fatia[];
};

export type Equipe = { cod: number; nome: string; membros: number };
export type Carteira = { cod: number; nome: string };

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

const SQL_ACORDOS = `
WITH aco AS (
  SELECT a.acocod, a.devcod, a.carcod, a.acodatinc, a.acovalatu, a.acousuinc
    FROM acordo a
   WHERE a.acoati = 0
     AND a.acodatinc::date >= $1::date
     AND a.acodatinc::date <= $2::date
     AND ($3::int IS NULL OR a.carcod = $3::int)
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
         extract(hour from d.acodatinc)::int AS hora
    FROM dono d
    -- LEFT e não JOIN: com o inner, um acordo cujo operador sumiu do cadastro
    -- desapareceria da CONTAGEM TOTAL também, e o número grande da tela
    -- encolheria sem que ninguém percebesse. Aqui ele vira "(sem operadora)".
    LEFT JOIN usuario u  ON u.usucod = d.usucod
    LEFT JOIN carteira ca ON ca.carcod = d.carcod
   WHERE ($4::int IS NULL OR EXISTS (
           SELECT 1 FROM grupo_usuario gu
            WHERE gu.usucod = d.usucod AND gu.usugrucod = $4::int))
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(carcod) = 0 THEN 'carteira'
            WHEN grouping(hora)   = 0 THEN 'hora'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(carcod) = 0 THEN carcod
            WHEN grouping(hora)   = 0 THEN hora END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(carcod) = 0 THEN carnom END AS rotulo,
       count(*)::int AS qtd,
       COALESCE(sum(acovalatu), 0)::float8 AS valor
  FROM base
 GROUP BY GROUPING SETS ((usucod, usunom), (carcod, carnom), (hora), ())`;

const SQL_ACIONAMENTOS = `
WITH base AS (
  SELECT r.usucod, u.usunom, r.devcod, cs.sitnom,
         extract(hour from r.retdatinc)::int AS hora
    FROM retorno r
    LEFT JOIN usuario u ON u.usucod = r.usucod
    -- (carcod, sitcod) é único em carteira_situacao (conferido): o LEFT JOIN
    -- não multiplica linha e a contagem continua sendo de ações, não de pares.
    LEFT JOIN carteira_situacao cs
           ON cs.carcod = r.carcod AND cs.sitcod = r.sitcod
   WHERE r.rettip = 0
     -- retdatinc é timestamp: "< dia seguinte" inclui o dia final inteiro.
     AND r.retdatinc >= $1::date
     AND r.retdatinc <  $2::date + 1
     AND ($3::int IS NULL OR r.carcod = $3::int)
     AND ($4::int IS NULL OR EXISTS (
           SELECT 1 FROM grupo_usuario gu
            WHERE gu.usucod = r.usucod AND gu.usugrucod = $4::int))
)
SELECT CASE WHEN grouping(usucod) = 0 THEN 'operadora'
            WHEN grouping(sitnom) = 0 THEN 'situacao'
            WHEN grouping(hora)   = 0 THEN 'hora'
            ELSE 'total' END AS eixo,
       CASE WHEN grouping(usucod) = 0 THEN usucod
            WHEN grouping(hora)   = 0 THEN hora END::int AS chave,
       CASE WHEN grouping(usucod) = 0 THEN usunom
            WHEN grouping(sitnom) = 0 THEN sitnom END AS rotulo,
       count(*)::int AS qtd,
       count(DISTINCT devcod)::int AS valor
  FROM base
 GROUP BY GROUPING SETS ((usucod, usunom), (sitnom), (hora), ())`;

type LinhaEixo = {
  eixo: string;
  chave: number | null;
  rotulo: string | null;
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

function totalDe(linhas: LinhaEixo[]): { qtd: number; valor: number } {
  const t = linhas.find((l) => l.eixo === "total");
  return { qtd: t?.qtd ?? 0, valor: t?.valor ?? 0 };
}

export async function acordosDo(f: Filtro): Promise<Acordos> {
  const linhas = await consultaRelatorio<LinhaEixo>(SQL_ACORDOS, [
    f.inicio,
    f.fim,
    f.carteira,
    f.equipe,
  ]);
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    valor: total.valor,
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
    porCarteira: fatias(linhas, "carteira", SEM_CARTEIRA),
    porHora: linhaDoTempo(linhas),
  };
}

export async function acionamentosDe(f: Filtro): Promise<Acionamentos> {
  const linhas = await consultaRelatorio<LinhaEixo>(SQL_ACIONAMENTOS, [
    f.inicio,
    f.fim,
    f.carteira,
    f.equipe,
  ]);
  const total = totalDe(linhas);
  return {
    qtd: total.qtd,
    // No acionamento a coluna "valor" carrega DEVEDORES DISTINTOS: 300 ações
    // em 30 pessoas é uma tarde muito diferente de 300 ações em 300 pessoas.
    devedores: total.valor,
    porOperadora: fatias(linhas, "operadora", SEM_OPERADORA),
    porSituacao: fatias(linhas, "situacao", SEM_SITUACAO),
    porHora: linhaDoTempo(linhas),
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
