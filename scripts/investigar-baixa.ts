// Onde está o vínculo entre a PARCELA DO ACORDO e o pagamento dela.
//
// Rodar:  npm run db:investigar-baixa
// (dentro da rede da Cobratec — somente leitura)
//
// ─────────────────────────────── por que existe ───────────────────────────────
//
// `scripts/validar-parcelas.ts` mediu o caminho que eu supus — `boleto.bolcon =
// acocod AND boleto.bolpar = acoparnum` — e o resultado foi **4 casamentos em
// 22.801**. Não é um join imperfeito; é um join errado. E os outros dois
// números do mesmo relatório dizem por quê:
//
//   • `boleto_baixa` está saudável: 151.176 baixas, R$ 83,8M, de 2019 até
//     ontem, ZERO órfãs. Falta de dado não é o problema.
//   • 95,6% dos acordos que apareceriam "em aberto" têm recebimento em
//     `operacao`, e o valor bate quase exatamente com o "em aberto" calculado
//     (R$ 12,76M contra R$ 12,75M). As parcelas estão sendo pagas.
//
// Conclusão: `bolcon`/`bolpar` guardam OUTRA COISA. Este script testa cinco
// hipóteses de vínculo e mostra dado cru para conferência — em vez de eu
// adivinhar uma segunda vez.
//
// Nada aqui escreve: `consultaRelatorio` abre `BEGIN READ ONLY`.
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

/** As parcelas vencidas dos últimos 180 dias — o universo de todas as provas. */
const VENCIDAS = `
  SELECT ap.acocod, ap.acoparseq, ap.acoparnum, ap.acoparvallan, ap.acopardatven,
         a.devcod, a.carcod, a.aconumcon
    FROM acordo_parcela ap
    JOIN acordo a ON a.acocod = ap.acocod
   WHERE a.acoati = 0
     AND ap.acoparvallan > 0
     AND ap.acopardatven <  CURRENT_DATE
     AND ap.acopardatven >= CURRENT_DATE - INTERVAL '180 days'`;

/**
 * H1 · `boleto_controle` — a tabela de ligação que ninguém validou.
 *
 * Ela tem `bolacocod` (acordo) e `bolparseq` (sequência da parcela). Se
 * `bolparseq` apontar para `acoparseq` — a CHAVE da parcela, e não o número
 * dela dentro do acordo —, o vínculo é este e o meu erro foi confundir os dois.
 */
async function h1() {
  titulo("H1 · boleto_controle.bolacocod + bolparseq → acordo_parcela.acoparseq");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH v AS (${VENCIDAS})
     SELECT count(*)::int AS vencidas,
            count(bc.bolcodseq)::int AS com_boleto,
            count(bb.bolcodseq)::int AS com_baixa,
            COALESCE(sum(bb.bolbaipag), 0)::float8 AS pago
       FROM v
       LEFT JOIN boleto_controle bc
              ON bc.bolacocod = v.acocod AND bc.bolparseq = v.acoparseq
       LEFT JOIN boleto_baixa bb
              ON bb.bolcodseq = bc.bolcodseq AND bb.bolbaipag > 0`,
    [],
    120_000,
  );
  console.log(`   vencidas ......... ${br(N(r.vencidas))}`);
  console.log(`   com boleto ....... ${br(N(r.com_boleto))}  ${pct(N(r.com_boleto), N(r.vencidas))}`);
  console.log(`   com baixa ........ ${br(N(r.com_baixa))}  ${pct(N(r.com_baixa), N(r.vencidas))}`);
  console.log(`   valor pago ....... ${dinheiro(N(r.pago))}`);
  return N(r.com_baixa) / Math.max(1, N(r.vencidas));
}

/**
 * H2 · `comissao` — pagamento amarrado à parcela do acordo.
 *
 * `comacocod` + `comacoparseq` + `comdatpag` + `comvalpag`. Comissão se paga
 * quando o dinheiro entra, então a existência da linha é sinal de parcela
 * quitada — e no nível de granularidade que o painel de aging precisa.
 * 133 mil linhas, e nenhum diagnóstico do projeto irmão a testou.
 */
async function h2() {
  titulo("H2 · comissao.comacocod + comacoparseq → parcela paga");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH v AS (${VENCIDAS})
     SELECT count(*)::int AS vencidas,
            count(c.comcod)::int AS com_comissao,
            count(*) FILTER (WHERE c.comdatpag > DATE '1900-01-01')::int AS com_datpag,
            COALESCE(sum(c.comvalpag), 0)::float8 AS valor_pago
       FROM v
       LEFT JOIN comissao c
              ON c.comacocod = v.acocod AND c.comacoparseq = v.acoparseq`,
    [],
    120_000,
  );
  console.log(`   vencidas ......... ${br(N(r.vencidas))}`);
  console.log(`   com comissão ..... ${br(N(r.com_comissao))}  ${pct(N(r.com_comissao), N(r.vencidas))}`);
  console.log(`   com data de pgto . ${br(N(r.com_datpag))}  ${pct(N(r.com_datpag), N(r.vencidas))}`);
  console.log(`   valor pago ....... ${dinheiro(N(r.valor_pago))}`);
  return N(r.com_datpag) / Math.max(1, N(r.vencidas));
}

/**
 * H3 · `boleto.bolpar` seria `acoparseq`, e não `acoparnum`.
 *
 * A hipótese mais barata: eu troquei o número da parcela dentro do acordo pela
 * chave dela. Se for isso, o join original volta a funcionar trocando uma
 * coluna.
 */
async function h3() {
  titulo("H3 · boleto.bolcon = acocod  AND  boleto.bolpar = acoparseq");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH v AS (${VENCIDAS})
     SELECT count(*)::int AS vencidas,
            count(bo.bolcodseq)::int AS com_boleto,
            count(bb.bolcodseq)::int AS com_baixa
       FROM v
       LEFT JOIN boleto bo
              ON bo.bolcon = v.acocod AND bo.bolpar = v.acoparseq
             AND bo.boldevcod = v.devcod AND bo.bolcarcod = v.carcod
       LEFT JOIN boleto_baixa bb
              ON bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0`,
    [],
    120_000,
  );
  console.log(`   com boleto ....... ${br(N(r.com_boleto))}  ${pct(N(r.com_boleto), N(r.vencidas))}`);
  console.log(`   com baixa ........ ${br(N(r.com_baixa))}  ${pct(N(r.com_baixa), N(r.vencidas))}`);
  return N(r.com_baixa) / Math.max(1, N(r.vencidas));
}

/**
 * H4 · dado cru, para ler com os olhos.
 *
 * Três acordos que têm parcela vencida E recebimento em `operacao`, com os
 * boletos deles ao lado. É onde se vê o que `bolcon` e `bolpar` realmente
 * guardam — nenhuma hipótese acima sobrevive a olhar a tabela.
 *
 * Só códigos e números: nenhum nome, CPF ou telefone de devedor.
 */
async function h4() {
  titulo("H4 · amostra crua — o que bolcon/bolpar guardam de verdade");
  const acordos = await consultaRelatorio<Record<string, unknown>>(
    `WITH v AS (${VENCIDAS})
     SELECT v.acocod, v.carcod, v.devcod, v.aconumcon,
            count(*)::int AS parcelas_vencidas,
            min(v.acoparseq)::int AS seq_min,
            max(v.acoparseq)::int AS seq_max,
            min(v.acoparnum)::int AS num_min,
            max(v.acoparnum)::int AS num_max
       FROM v
      WHERE EXISTS (SELECT 1 FROM operacao o
                     WHERE o.opeacocod = v.acocod AND o.opevalrec > 0)
      GROUP BY 1,2,3,4
      ORDER BY 5 DESC
      LIMIT 3`,
    [],
    120_000,
  );

  for (const a of acordos) {
    console.log(
      `\n   ACORDO acocod=${a.acocod} · aconumcon=${a.aconumcon} · carcod=${a.carcod} · devcod=${a.devcod}`,
    );
    console.log(
      `     parcelas vencidas: ${a.parcelas_vencidas} · acoparseq ${a.seq_min}..${a.seq_max} · acoparnum ${a.num_min}..${a.num_max}`,
    );

    const boletos = await consultaRelatorio<Record<string, unknown>>(
      `SELECT bo.bolcodseq, bo.bolcon, bo.bolpar, bo.bolconcod, bo.bolconnumcon,
              bo.boldatven, bo.bolvaldoc::float8 AS valor,
              (SELECT count(*)::int FROM boleto_baixa bb
                WHERE bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0) AS baixas
         FROM boleto bo
        WHERE bo.boldevcod = $1::int AND bo.bolcarcod = $2::int
        ORDER BY bo.boldatven DESC
        LIMIT 6`,
      [a.devcod, a.carcod],
      60_000,
    );
    if (boletos.length === 0) {
      console.log("     (nenhum boleto para este devedor nesta carteira)");
    }
    for (const b of boletos) {
      console.log(
        `     boleto seq=${b.bolcodseq} bolcon=${b.bolcon} bolpar=${b.bolpar} ` +
          `bolconcod=${b.bolconcod} venc=${String(b.boldatven).slice(0, 10)} ` +
          `${dinheiro(N(b.valor))} baixas=${b.baixas}`,
      );
    }

    const controle = await consultaRelatorio<Record<string, unknown>>(
      `SELECT bolcodseq, bolacocod, bolparseq, bolconseq, bolati
         FROM boleto_controle WHERE bolacocod = $1::int LIMIT 6`,
      [a.acocod],
      60_000,
    );
    if (controle.length === 0) {
      console.log("     boleto_controle: nenhuma linha para este acordo");
    }
    for (const c of controle) {
      console.log(
        `     controle seq=${c.bolcodseq} bolacocod=${c.bolacocod} ` +
          `bolparseq=${c.bolparseq} bolconseq=${c.bolconseq} ati=${c.bolati}`,
      );
    }
  }
}

/**
 * H5 · o modelo que não precisa de vínculo por parcela.
 *
 * Se nenhuma das hipóteses acima fechar, ainda dá para responder a pergunta —
 * por SALDO, que é como contabilidade de recebível funciona:
 *
 *     em atraso = soma das parcelas já vencidas − o que entrou no acordo
 *
 * `operacao.opeacocod` é o vínculo, e ele liga (8.000 de 8.371). Não diz QUAL
 * parcela foi paga, e não precisa: um acordo em 12x com três pagas e nove
 * vencidas tem o atraso certo pela diferença. O aging sai consumindo o recebido
 * contra as parcelas em ordem de vencimento.
 *
 * Esta consulta mede se o modelo produz número plausível — quantos acordos
 * ficam com saldo devedor, quantos ficam quites, e quantos ficam NEGATIVOS
 * (recebido maior que o vencido, que é normal: entrada e parcela futura paga
 * adiantada, mas em excesso indicaria que `operacao` traz dinheiro que não é
 * deste acordo).
 */
async function h5() {
  titulo("H5 · modelo por saldo: vencido − recebido (via operacao)");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH v AS (${VENCIDAS}),
     venc AS (
       SELECT acocod, sum(acoparvallan)::float8 AS vencido, count(*)::int AS parcelas
         FROM v GROUP BY 1
     ), rec AS (
       SELECT opeacocod AS acocod, sum(opevalrec)::float8 AS recebido
         FROM operacao WHERE opevalrec > 0 GROUP BY 1
     )
     SELECT count(*)::int AS acordos,
            count(*) FILTER (WHERE COALESCE(r.recebido,0) = 0)::int AS sem_nada,
            count(*) FILTER (WHERE COALESCE(r.recebido,0) >= venc.vencido)::int AS quites,
            count(*) FILTER (WHERE COALESCE(r.recebido,0) > 0
                               AND COALESCE(r.recebido,0) < venc.vencido)::int AS parcial,
            COALESCE(sum(GREATEST(venc.vencido - COALESCE(r.recebido,0), 0)), 0)::float8 AS atraso,
            COALESCE(sum(venc.vencido), 0)::float8 AS vencido_total,
            COALESCE(sum(GREATEST(COALESCE(r.recebido,0) - venc.vencido, 0)), 0)::float8 AS excedente
       FROM venc
       LEFT JOIN rec r ON r.acocod = venc.acocod`,
    [],
    120_000,
  );
  const acordos = N(r.acordos);
  console.log(`   acordos com parcela vencida ... ${br(acordos)}`);
  console.log(`   quites (recebido ≥ vencido) ... ${br(N(r.quites))}  ${pct(N(r.quites), acordos)}`);
  console.log(`   parcialmente pagos ............ ${br(N(r.parcial))}  ${pct(N(r.parcial), acordos)}`);
  console.log(`   sem nenhum recebimento ........ ${br(N(r.sem_nada))}  ${pct(N(r.sem_nada), acordos)}`);
  console.log(`   vencido total ................. ${dinheiro(N(r.vencido_total))}`);
  console.log(`   ATRASO pelo modelo de saldo ... ${dinheiro(N(r.atraso))}`);
  console.log(`   excedente (recebido a mais) ... ${dinheiro(N(r.excedente))}`);
  return { atraso: N(r.atraso), vencido: N(r.vencido_total) };
}

function veredito(
  h: { h1: number; h2: number; h3: number },
  saldo: { atraso: number; vencido: number },
) {
  titulo("Veredito");
  const melhor = Math.max(h.h1, h.h2, h.h3);
  const nome = h.h1 === melhor ? "H1 (boleto_controle)" : h.h2 === melhor ? "H2 (comissao)" : "H3 (bolpar = acoparseq)";

  if (melhor >= 0.4) {
    console.log(`   ✅ ${nome} fecha, com ${(melhor * 100).toFixed(1)}% de cobertura.`);
    console.log("      É o vínculo por PARCELA — o aging sai exato. Troque o CTE_PAGO");
    console.log("      em lib/relatorios-carteira.ts por este caminho.");
  } else if (melhor >= 0.15) {
    console.log(`   ⚠️  ${nome} é o melhor, mas só ${(melhor * 100).toFixed(1)}%.`);
    console.log("      Não basta sozinho. Use o modelo de saldo (H5) para o VALOR");
    console.log("      e este vínculo apenas como reforço.");
  } else {
    console.log("   ❌ Nenhum vínculo por parcela funciona neste banco.");
    console.log("      O caminho é o modelo de SALDO (H5): vencido − recebido, por acordo.");
    console.log("      Ele não precisa saber qual parcela foi paga — e é como");
    console.log("      contabilidade de recebível calcula atraso de qualquer jeito.");
  }

  const proporcao = saldo.vencido === 0 ? 0 : saldo.atraso / saldo.vencido;
  console.log(
    `\n   Pelo modelo de saldo, o atraso é ${(proporcao * 100).toFixed(1)}% do vencido ` +
      `(${dinheiro(saldo.atraso)} de ${dinheiro(saldo.vencido)}).`,
  );
  if (proporcao > 0.9) {
    console.log("   ⚠️  Ainda alto demais — `operacao` pode não cobrir estas carteiras.");
    console.log("      Olhe a amostra de H4 antes de confiar no número.");
  }
}

async function main() {
  if (!configSiscobra()) {
    console.error("Siscobra não configurado (DB_HOST/DB_USER/DB_NAME).");
    process.exit(1);
  }
  console.log(
    "Procurando o vínculo parcela ↔ pagamento no Siscobra (somente leitura).\n" +
      "O caminho por boleto.bolcon/bolpar já foi medido e casa 4 em 22.801 — está errado.",
  );
  try {
    const r1 = await h1();
    const r2 = await h2();
    const r3 = await h3();
    await h4();
    const saldo = await h5();
    veredito({ h1: r1, h2: r2, h3: r3 }, saldo);
  } catch (e) {
    console.error(`\nFalhou: ${(e as Error).message}`);
    console.error(
      "Se for coluna inexistente, a hipótese morreu aí mesmo — me diga qual e eu tiro.",
    );
    process.exit(1);
  }
  process.exit(0);
}

void main();
