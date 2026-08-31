// Descobre o que as tabelas de comissão do Siscobra guardam, antes de elas
// virarem uma coluna de planilha chamada "honorários".
//
// Rodar:  npm run db:validar-comissao
// (precisa estar dentro da rede da Cobratec — o CRM só atende na LAN)
//
// ─────────────────────────────── por que existe ───────────────────────────────
//
// A decisão 39 pediu "honorários por mês de cada operadora por carteira".
// Acordos e acionamentos (decisão 35) foram conferidos linha a linha contra os
// PDFs que o próprio Siscobra imprime — 104/104 e 100%. Comissão NÃO foi, por
// ninguém: não há ADR sobre ela em `siscobra_postgresql/docs/DECISOES.md`, e
// nenhuma view do projeto irmão a toca.
//
// ─────────────────────── e a primeira rodada valeu a pena ───────────────────────
//
// Rodado em 18/08/2026, este script DERRUBOU a primeira versão de
// `lib/relatorios-comissao.ts`, que atribuía a comissão por
// `comissao.comopecod`. O nome diz "código do operador" e ele não é isso:
//
//   • `comopecod` — 139.842 valores distintos em 139.842 linhas, faixa
//     106–2.636.812, **100% órfãos** em `usuario`. É um id sequencial.
//   • `comusuinc` — 19 valores distintos, todos válidos: o back-office que
//     lançou o registro, não quem trabalhou o caso.
//   • **`comissao_operadores.usucod`** — 146 pessoas, nomes reais. É esta.
//
// Outras três medidas que mandam no desenho da consulta:
//
//   • `comopeval` e `comopeper` estão TODOS zerados — a repartição por
//     `comopetipo` que a tabela promete não existe neste banco. O único valor é
//     `comvalcom`, da comissão inteira. Por isso a aba se chama COMISSÃO e não
//     honorário.
//   • São exatamente 3 linhas por comissão (419.526 / 139.842 = 3,00), e em
//     96,2% delas é a MESMA pessoa (máximo observado: 2). Somar pelo join cru
//     triplicaria o dinheiro; daí o `DISTINCT ON`.
//   • `carteira_comissoes` e `carteira_repasse` estão VAZIAS — o % por carteira
//     não está cadastrado, então nada é recalculável.
//
// O que este script NÃO faz, e continua faltando: comparar um mês com o
// relatório de comissão que o Siscobra imprime. Enquanto isso não acontecer,
// `CONFERIDA = false` mantém a ressalva colada ao número, hoje na planilha.
//
// Ele não escreve nada: `consultaRelatorio` abre `BEGIN READ ONLY`, e o usuário
// do banco tem apenas GRANT SELECT.
//
// O que fazer com o resultado está no fim do arquivo, em `veredito()`.
import { configSiscobra, consultaRelatorio } from "@/lib/siscobra";

const N = (v: unknown) => Number(v ?? 0);
const br = (n: number) => n.toLocaleString("pt-BR");
const dinheiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (parte: number, todo: number) =>
  todo === 0 ? "—" : `${((parte / todo) * 100).toFixed(1)}%`;

function titulo(t: string) {
  console.log(`\n${t}\n${"─".repeat(t.length)}`);
}

/** 1. `comissao` tem dado, e de quando? */
async function volume() {
  titulo("1. comissao — há dado, e em que janela?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `SELECT count(*)::int                                   AS linhas,
            count(*) FILTER (WHERE comvalcom > 0)::int      AS com_comissao,
            count(*) FILTER (WHERE comvalpag > 0)::int      AS com_pagamento,
            COALESCE(sum(comvalcom), 0)::float8             AS soma_comissao,
            COALESCE(sum(comvalpag), 0)::float8             AS soma_pagamento,
            count(DISTINCT comopecod)::int                  AS operadoras,
            count(DISTINCT comcarcod)::int                  AS carteiras,
            min(comdatpag) FILTER (
              WHERE comdatpag > DATE '1900-01-01')          AS primeira,
            max(comdatpag)                                  AS ultima,
            count(*) FILTER (
              WHERE comdatpag IS NULL
                 OR comdatpag <= DATE '1900-01-01')::int    AS sem_data
       FROM comissao`,
    [],
    60_000,
  );
  console.log(`   linhas .................. ${br(N(r.linhas))}`);
  console.log(
    `   com comvalcom > 0 ....... ${br(N(r.com_comissao))}  (${dinheiro(N(r.soma_comissao))})`,
  );
  console.log(
    `   com comvalpag > 0 ....... ${br(N(r.com_pagamento))}  (${dinheiro(N(r.soma_pagamento))})`,
  );
  console.log(`   operadoras distintas .... ${br(N(r.operadoras))}`);
  console.log(`   carteiras distintas ..... ${br(N(r.carteiras))}`);
  console.log(`   comdatpag ............... ${r.primeira} → ${r.ultima}`);
  console.log(
    `   sem data útil ........... ${br(N(r.sem_data))}  ${pct(N(r.sem_data), N(r.linhas))}`,
  );
  // Sentinela 0001-01-01 é o modo preferido deste banco de dizer "vazio" sem
  // usar NULL — foi o que derrubou `acodatrec` e `boldatpar` no ADR D-009.
  if (N(r.sem_data) > N(r.linhas) * 0.5) {
    console.log(
      "   ⚠️  Mais da metade sem data útil: `comdatpag` pode ser mais uma coluna",
    );
    console.log("      com sentinela. Procure a data em `comdatcad`.");
  }
  return {
    linhas: N(r.linhas),
    comComissao: N(r.com_comissao),
    somaComissao: N(r.soma_comissao),
    semData: N(r.sem_data),
  };
}

/** 2. Os tipos de `comissao_operadores` — a pergunta central. */
async function tipos() {
  titulo("2. comissao_operadores — quais tipos existem, e quanto pesam?");
  const linhas = await consultaRelatorio<Record<string, unknown>>(
    `SELECT comopetipo::text                     AS tipo,
            count(*)::int                        AS linhas,
            COALESCE(sum(comopeval), 0)::float8  AS soma,
            COALESCE(avg(comopeper), 0)::float8  AS pct_medio,
            COALESCE(min(comopeper), 0)::float8  AS pct_min,
            COALESCE(max(comopeper), 0)::float8  AS pct_max,
            count(DISTINCT usucod)::int          AS operadoras
       FROM comissao_operadores
      GROUP BY 1
      ORDER BY 2 DESC`,
    [],
    60_000,
  );
  if (linhas.length === 0) {
    console.log("   (tabela vazia)");
    return [];
  }
  console.log("   tipo  |    linhas |          soma | % médio | % faixa      | oper.");
  for (const l of linhas) {
    console.log(
      `   ${String(l.tipo).padEnd(5)} | ${br(N(l.linhas)).padStart(9)} | ` +
        `${dinheiro(N(l.soma)).padStart(13)} | ${N(l.pct_medio).toFixed(2).padStart(7)} | ` +
        `${N(l.pct_min).toFixed(1)}–${N(l.pct_max).toFixed(1)}`.padEnd(12) +
        ` | ${br(N(l.operadoras))}`,
    );
  }
  return linhas.map((l) => ({ tipo: String(l.tipo), linhas: N(l.linhas) }));
}

/**
 * 3. Qual tipo é o HONORÁRIO.
 *
 * O cadastro do operador tem quatro percentuais nomeados. Se o `comopeper` de um
 * tipo bate com `usuperhon` da mesma pessoa e os outros tipos batem com os
 * outros três, o mapeamento está identificado por construção — não por palpite
 * sobre a ordem dos códigos.
 */
async function qualEhHonorario() {
  titulo("3. comopetipo × usuario.usuper* — qual tipo é o honorário?");
  const linhas = await consultaRelatorio<Record<string, unknown>>(
    `WITH par AS (
       SELECT co.comopetipo::text AS tipo, co.usucod, co.comopeper,
              u.usuperpri, u.usuperenc, u.usuperrec, u.usuperhon
         FROM comissao_operadores co
         JOIN usuario u ON u.usucod = co.usucod
        WHERE co.comopeper > 0
     )
     SELECT tipo,
            count(*)::int AS linhas,
            count(*) FILTER (WHERE abs(comopeper - usuperpri) < 0.01)::int AS bate_pri,
            count(*) FILTER (WHERE abs(comopeper - usuperenc) < 0.01)::int AS bate_enc,
            count(*) FILTER (WHERE abs(comopeper - usuperrec) < 0.01)::int AS bate_rec,
            count(*) FILTER (WHERE abs(comopeper - usuperhon) < 0.01)::int AS bate_hon
       FROM par
      GROUP BY 1
      ORDER BY 2 DESC`,
    [],
    60_000,
  );
  if (linhas.length === 0) {
    console.log("   Nenhuma linha com comopeper > 0 — o percentual não é gravado aqui.");
    console.log("   Nesse caso o honorário terá de vir de `comvalcom`, sem repartição.");
    return null;
  }
  console.log("   tipo  |   linhas | =pri  | =enc  | =rec  | =HON");
  let melhor: { tipo: string; taxa: number } | null = null;
  for (const l of linhas) {
    const n = N(l.linhas);
    console.log(
      `   ${String(l.tipo).padEnd(5)} | ${br(n).padStart(8)} | ` +
        `${pct(N(l.bate_pri), n).padStart(5)} | ${pct(N(l.bate_enc), n).padStart(5)} | ` +
        `${pct(N(l.bate_rec), n).padStart(5)} | ${pct(N(l.bate_hon), n).padStart(5)}`,
    );
    const taxa = n === 0 ? 0 : N(l.bate_hon) / n;
    if (!melhor || taxa > melhor.taxa) melhor = { tipo: String(l.tipo), taxa };
  }
  if (melhor && melhor.taxa >= 0.8) {
    console.log(
      `\n   → comopetipo = ${melhor.tipo} casa com usuperhon em ${(melhor.taxa * 100).toFixed(1)}% das linhas.`,
    );
  }
  return melhor;
}

/** 4. `sum(comopeval)` por comissão reconcilia com `comvalcom`? */
async function reconciliacao() {
  titulo("4. A repartição fecha com o total da comissão?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH soma AS (
       SELECT c.comcod, c.comvalcom,
              COALESCE(sum(co.comopeval), 0) AS repartido,
              count(co.*)::int AS partes
         FROM comissao c
         LEFT JOIN comissao_operadores co ON co.comcod = c.comcod
        GROUP BY c.comcod, c.comvalcom
     )
     SELECT count(*)::int                                        AS comissoes,
            count(*) FILTER (WHERE partes = 0)::int              AS sem_partes,
            COALESCE(avg(partes), 0)::float8                     AS partes_media,
            count(*) FILTER (
              WHERE abs(comvalcom - repartido) < 0.01)::int      AS fecha,
            COALESCE(sum(comvalcom), 0)::float8                  AS total_com,
            COALESCE(sum(repartido), 0)::float8                  AS total_rep
       FROM soma`,
    [],
    120_000,
  );
  const n = N(r.comissoes);
  console.log(`   comissões ............... ${br(n)}`);
  console.log(`   sem nenhuma parte ....... ${br(N(r.sem_partes))}  ${pct(N(r.sem_partes), n)}`);
  console.log(`   partes por comissão ..... ${N(r.partes_media).toFixed(2)} (média)`);
  console.log(`   soma das partes fecha ... ${br(N(r.fecha))}  ${pct(N(r.fecha), n)}`);
  console.log(`   total comvalcom ......... ${dinheiro(N(r.total_com))}`);
  console.log(`   total comopeval ......... ${dinheiro(N(r.total_rep))}`);
  return { comissoes: n, fecha: N(r.fecha), semPartes: N(r.sem_partes) };
}

/** 5. As chaves ligam? (operadora, carteira, acordo) */
async function cobertura() {
  titulo("5. As chaves acham dono do outro lado?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `SELECT count(*)::int                                     AS linhas,
            count(*) FILTER (WHERE u.usucod  IS NULL)::int    AS sem_operadora,
            count(*) FILTER (WHERE ca.carcod IS NULL)::int    AS sem_carteira,
            count(*) FILTER (WHERE a.acocod  IS NULL)::int    AS sem_acordo
       FROM comissao c
       LEFT JOIN usuario  u  ON u.usucod  = c.comopecod
       LEFT JOIN carteira ca ON ca.carcod = c.comcarcod
       LEFT JOIN acordo   a  ON a.acocod  = c.comacocod`,
    [],
    120_000,
  );
  const n = N(r.linhas);
  console.log(`   linhas .................. ${br(n)}`);
  console.log(
    `   comopecod órfão ......... ${br(N(r.sem_operadora))}  ${pct(N(r.sem_operadora), n)}`,
  );
  console.log(
    `   comcarcod órfão ......... ${br(N(r.sem_carteira))}  ${pct(N(r.sem_carteira), n)}`,
  );
  console.log(
    `   comacocod órfão ......... ${br(N(r.sem_acordo))}  ${pct(N(r.sem_acordo), n)}`,
  );
  console.log(
    "\n   (comacocod órfão é esperado em parte: `comconcod` indica que a comissão",
  );
  console.log("    também nasce de CONTRATO, não só de acordo.)");
  return { linhas: n, semOperadora: N(r.sem_operadora), semCarteira: N(r.sem_carteira) };
}

/**
 * 5b. A coluna que REALMENTE identifica a operadora.
 *
 * Este passo nasceu do resultado do passo 5 em 18/08/2026: `comissao.comopecod`
 * é 100% órfão em `usuario` e tem um valor distinto por linha — é um id
 * sequencial, não o código do operador. `comusuinc` também não serve (19
 * valores, o back-office que lançou).
 *
 * A pessoa está em `comissao_operadores.usucod`, e é o que a consulta usa. Este
 * passo confere que continua sendo verdade — se o CRM mudar, é aqui que aparece.
 */
async function ondeEstaAOperadora() {
  titulo("5b. Onde está a operadora, afinal?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH ope AS (
       SELECT DISTINCT ON (co.comcod) co.comcod, co.usucod
         FROM comissao_operadores co
        ORDER BY co.comcod, co.comopetipo, co.usucod
     )
     SELECT count(*)::int                                       AS total,
            count(*) FILTER (WHERE d.comcod IS NULL)::int       AS sem_linha,
            count(*) FILTER (WHERE u.usucod IS NULL)::int       AS sem_operadora,
            count(DISTINCT u.usucod)::int                       AS pessoas,
            COALESCE(sum(c.comvalcom) FILTER (
              WHERE u.usucod IS NULL), 0)::float8               AS valor_sem
       FROM comissao c
       LEFT JOIN ope d ON d.comcod = c.comcod
       LEFT JOIN usuario u ON u.usucod = d.usucod`,
    [],
    120_000,
  );
  const t = N(r.total);
  console.log(`   comissões ............... ${br(t)}`);
  console.log(
    `   sem linha em _operadores  ${br(N(r.sem_linha))}  ${pct(N(r.sem_linha), t)}`,
  );
  console.log(
    `   usucod fora do cadastro . ${br(N(r.sem_operadora))}  ${pct(N(r.sem_operadora), t)}` +
      `  (${dinheiro(N(r.valor_sem))})`,
  );
  console.log(`   operadoras reconhecidas . ${br(N(r.pessoas))}`);

  // A repartição em 3 linhas por comissão precisa render UMA pessoa, senão o
  // DISTINCT ON está escolhendo entre gente diferente e o crédito vira sorteio.
  const [m] = await consultaRelatorio<Record<string, unknown>>(
    `WITH x AS (SELECT comcod, count(DISTINCT usucod)::int AS pessoas
                  FROM comissao_operadores GROUP BY comcod)
     SELECT count(*)::int AS n,
            count(*) FILTER (WHERE pessoas = 1)::int AS uma,
            max(pessoas)::int AS maximo FROM x`,
    [],
    120_000,
  );
  console.log(
    `   uma pessoa por comissão . ${br(N(m.uma))} de ${br(N(m.n))}  ${pct(N(m.uma), N(m.n))}` +
      `  (máx ${N(m.maximo)})`,
  );
  if (N(m.uma) / Math.max(1, N(m.n)) < 0.9) {
    console.log(
      "   ⚠️  Muita comissão com mais de uma pessoa: o crédito por operadora vira",
    );
    console.log("      escolha arbitrária. Reveja o critério do DISTINCT ON.");
  }
  return { total: t, semOperadora: N(r.sem_operadora), umaPessoa: N(m.uma) / Math.max(1, N(m.n)) };
}

/** 6. As tabelas de percentual por carteira estão mesmo vazias? */
async function tabelasDePercentual() {
  titulo("6. carteira_comissoes / carteira_repasse — existe tabela de honorário?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `SELECT (SELECT count(*) FROM carteira_comissoes)::int AS comissoes,
            (SELECT count(*) FROM carteira_repasse)::int   AS repasse`,
    [],
    30_000,
  );
  console.log(`   carteira_comissoes ...... ${br(N(r.comissoes))} linhas`);
  console.log(`   carteira_repasse ........ ${br(N(r.repasse))} linhas`);
  if (N(r.comissoes) === 0) {
    console.log(
      "   → Confirmado: o % por carteira NÃO está cadastrado. O honorário só pode",
    );
    console.log("     vir do valor já calculado, nunca recalculado por percentual.");
  }
  return { comissoes: N(r.comissoes), repasse: N(r.repasse) };
}

/**
 * 7. O número que o gestor confere.
 *
 * Sem este passo o script prova coerência interna e nada mais. Quem sabe se o
 * valor está certo é quem vê o relatório do Siscobra todo mês — e a única forma
 * de perguntar isso é imprimir o número ao lado do nome.
 */
async function amostra() {
  titulo("7. Últimos 30 dias por operadora — para conferir contra o Siscobra");
  const linhas = await consultaRelatorio<Record<string, unknown>>(
    `SELECT COALESCE(u.usunom, '(sem cadastro)')     AS operadora,
            count(*)::int                            AS itens,
            COALESCE(sum(c.comvalcom), 0)::float8    AS comissao,
            COALESCE(sum(c.comvalpag), 0)::float8    AS pago
       FROM comissao c
       LEFT JOIN usuario u ON u.usucod = c.comopecod
      WHERE c.comdatpag >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 3 DESC
      LIMIT 15`,
    [],
    60_000,
  );
  if (linhas.length === 0) {
    console.log("   Nenhuma comissão nos últimos 30 dias.");
    console.log("   Se a operação paga comissão mensalmente, tente uma janela maior —");
    console.log("   ou `comdatpag` não é a data que se procura.");
    return;
  }
  for (const l of linhas) {
    console.log(
      `   ${String(l.operadora).slice(0, 28).padEnd(30)} ` +
        `${br(N(l.itens)).padStart(6)} itens  ${dinheiro(N(l.comissao)).padStart(14)}` +
        `  (pago ${dinheiro(N(l.pago))})`,
    );
  }
}

/**
 * O que decidir com tudo isso.
 *
 * A saída aqui vira uma linha na decisão 39. Enquanto ela disser "não publique",
 * a aba de comissão do Excel sai com o rótulo de não conferida — que é como ela
 * nasce, e não uma punição: é o mesmo tratamento que "em atraso" recebeu quando
 * `validar-parcelas.ts` mediu 0,0% de casamento.
 */
function veredito(
  vol: { linhas: number; comComissao: number; semData: number },
  rec: { comissoes: number; fecha: number; semPartes: number },
  cob: { linhas: number; semOperadora: number; semCarteira: number },
  hon: { tipo: string; taxa: number } | null,
  ope: { total: number; semOperadora: number; umaPessoa: number },
) {
  titulo("Veredito");

  if (vol.linhas === 0) {
    console.log("   ❌ `comissao` está vazia neste banco. A aba de honorários não tem");
    console.log("      fonte — remova-a do Excel em vez de exportar zeros.");
    return;
  }

  // A operadora é conferida pela coluna que a consulta USA
  // (`comissao_operadores.usucod`), e não por `comopecod`, que o passo 5 mostra
  // ser um id sequencial. O teto de 20% é folgado de propósito: "(sem
  // operadora)" é uma linha visível no relatório, não dinheiro perdido.
  const chaveOk =
    cob.linhas > 0 &&
    cob.semCarteira / cob.linhas < 0.05 &&
    ope.total > 0 &&
    ope.semOperadora / ope.total < 0.2 &&
    ope.umaPessoa >= 0.9;
  const dataOk = vol.semData / vol.linhas < 0.2;
  const reparteOk = rec.comissoes > 0 && rec.fecha / rec.comissoes >= 0.8;

  console.log(`   chaves (operadora/carteira) ... ${chaveOk ? "✅" : "❌"}`);
  console.log(
    `   sem operadora ................. ${pct(ope.semOperadora, ope.total)} das comissões`,
  );
  console.log(`   data de pagamento útil ........ ${dataOk ? "✅" : "❌"}`);
  console.log(`   repartição reconcilia ......... ${reparteOk ? "✅" : "⚠️ "}`);
  console.log(
    `   tipo do honorário ............. ${
      hon && hon.taxa >= 0.8 ? `✅ comopetipo = ${hon.tipo}` : "❌ não identificado"
    }`,
  );

  console.log("");
  if (chaveOk && dataOk) {
    console.log("   ✅ A agregação por operadora × carteira × mês é sustentável.");
    console.log("      Fonte: `comissao`, valor `comvalcom`, data `comdatpag`.");
    if (hon && hon.taxa >= 0.8) {
      console.log(
        `      Para a PARTE de honorário, use comissao_operadores com comopetipo = ${hon.tipo}.`,
      );
    } else {
      console.log("      Sem tipo identificado, a aba mostra a COMISSÃO INTEIRA e diz isso");
      console.log("      no cabeçalho — melhor um número certo com nome honesto que um");
      console.log("      número chamado 'honorário' por chute.");
    }
    console.log("");
    console.log("   Falta um passo, e ele não é de código: leve a seção 7 ao gestor e");
    console.log("   confira contra o relatório de comissão que o Siscobra imprime. Só");
    console.log("   depois disso o rótulo 'não conferido' sai da aba do Excel.");
  } else {
    console.log("   ⚠️  NÃO publique como valor absoluto ainda.");
    if (!chaveOk) {
      console.log("      Chave órfã demais: parte das comissões não tem operadora ou");
      console.log("      carteira reconhecível, e a soma por nome perderia dinheiro.");
      console.log(
        `      (sem operadora: ${pct(ope.semOperadora, ope.total)} · uma pessoa por comissão: ${(ope.umaPessoa * 100).toFixed(1)}%)`,
      );
    }
    if (!dataOk) {
      console.log("      `comdatpag` tem sentinela demais — o recorte por mês seria uma");
      console.log("      ficção. Teste `comdatcad` no lugar antes de seguir.");
    }
  }
}

async function main() {
  if (!configSiscobra()) {
    console.error(
      "Siscobra não configurado. Defina DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env.",
    );
    process.exit(1);
  }
  console.log(
    "Medindo as tabelas de comissão do Siscobra (somente leitura, nada é gravado).",
  );
  try {
    const vol = await volume();
    await tipos();
    const hon = await qualEhHonorario();
    const rec = await reconciliacao();
    const cob = await cobertura();
    const ope = await ondeEstaAOperadora();
    await tabelasDePercentual();
    await amostra();
    veredito(vol, rec, cob, hon, ope);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    console.error(`\nFalhou: ${msg}`);
    if (/does not exist|não existe/i.test(msg)) {
      console.error(
        "Se a tabela não existe, esta instalação do Siscobra não tem o módulo de",
      );
      console.error("comissão — e a aba de honorários não deve existir no Excel.");
    } else {
      console.error(
        "Se for tempo esgotado, o CRM está sob carga — repita fora do horário de pico.",
      );
    }
    process.exit(1);
  }
  process.exit(0);
}

void main();
