// Confere a cadeia parcela → boleto → baixa antes de ela virar painel.
//
// Rodar:  npm run db:validar-parcelas
// (precisa estar dentro da rede da Cobratec — o CRM só atende na LAN)
//
// ─────────────────────────────── por que existe ───────────────────────────────
//
// O painel "em atraso" de `/relatorios/carteira` afirma que uma parcela venceu e
// não foi paga. A parte "venceu" é certa: `acordo_parcela.acopardatven` é uma
// data confiável. A parte "não foi paga" é uma DEDUÇÃO — não existe coluna de
// pagamento na parcela (todas as candidatas estão zeradas ou com sentinela
// 0001-01-01, ver o ADR D-009 do projeto irmão), então o pagamento é procurado
// em `boleto_baixa` através de `boleto`.
//
// O ADR avisa, com estas palavras, que "o join cru parcela→boleto_baixa é
// parcial: boletos nascem de acordo E de contrato". Se ele for parcial de menos,
// o painel chama de inadimplente quem já pagou — e um falso alarme desses queima
// a confiança no relatório inteiro, inclusive na metade que está certa.
//
// Este script mede o tamanho dessa dúvida, em vez de deixá-la implícita. Ele não
// escreve nada: `consultaRelatorio` abre `BEGIN READ ONLY`, e o usuário do banco
// tem apenas GRANT SELECT.
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

/** 1. As baixas existem e estão ligadas a um boleto? */
async function baixas() {
  titulo("1. boleto_baixa — o razão de baixa está populado?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `SELECT count(*)::int                                        AS baixas,
            count(*) FILTER (WHERE bb.bolbaipag > 0)::int        AS com_valor,
            COALESCE(sum(bb.bolbaipag), 0)::float8               AS soma,
            count(*) FILTER (WHERE bo.bolcodseq IS NULL)::int    AS sem_boleto,
            min(bb.bolbaidatoco) FILTER (
              WHERE bb.bolbaidatoco > DATE '1900-01-01')         AS primeira,
            max(bb.bolbaidatoco)                                 AS ultima
       FROM boleto_baixa bb
       LEFT JOIN boleto bo ON bo.bolcodseq = bb.bolcodseq`,
    [],
    60_000,
  );
  console.log(`   baixas .............. ${br(N(r.baixas))}`);
  console.log(
    `   com valor ........... ${br(N(r.com_valor))}  (${dinheiro(N(r.soma))})`,
  );
  console.log(
    `   órfãs (sem boleto) .. ${br(N(r.sem_boleto))}  ${pct(N(r.sem_boleto), N(r.baixas))}`,
  );
  console.log(`   período ............. ${r.primeira} → ${r.ultima}`);
  return { baixas: N(r.baixas), semBoleto: N(r.sem_boleto) };
}

/**
 * 2. O coração da conferência: o join de 4 colunas contra o de 2.
 *
 * O de 2 colunas (`bolcon = acocod AND bolpar = acoparnum`) é o do diagnóstico
 * original. O de 4 acrescenta devedor e carteira, porque `bolcon` guarda tanto
 * código de acordo quanto de contrato — e um contrato de mesmo número casaria
 * com o acordo errado.
 *
 * A DIFERENÇA entre os dois é a medida do problema: se ela for grande, o join
 * de 2 colunas estava marcando como paga a parcela de outra pessoa.
 */
async function cobertura() {
  titulo("2. acordo_parcela → boleto → baixa (join de 2 colunas × de 4)");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH venc AS (
       SELECT ap.acocod, ap.acoparnum, ap.acoparvallan, a.devcod, a.carcod
         FROM acordo_parcela ap
         JOIN acordo a ON a.acocod = ap.acocod
        WHERE a.acoati = 0
          AND ap.acoparvallan > 0
          AND ap.acopardatven <  CURRENT_DATE
          AND ap.acopardatven >= CURRENT_DATE - INTERVAL '180 days'
     ), pago2 AS (
       SELECT DISTINCT bo.bolcon AS acocod, bo.bolpar AS acoparnum
         FROM boleto bo
         JOIN boleto_baixa bb ON bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0
     ), pago4 AS (
       SELECT DISTINCT bo.bolcon AS acocod, bo.bolpar AS acoparnum,
              bo.boldevcod AS devcod, bo.bolcarcod AS carcod
         FROM boleto bo
         JOIN boleto_baixa bb ON bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0
     )
     SELECT count(*)::int AS vencidas,
            COALESCE(sum(v.acoparvallan), 0)::float8 AS valor_vencido,
            count(p2.acocod)::int AS casa_com_2,
            count(p4.acocod)::int AS casa_com_4
       FROM venc v
       LEFT JOIN pago2 p2 ON p2.acocod = v.acocod AND p2.acoparnum = v.acoparnum
       LEFT JOIN pago4 p4 ON p4.acocod = v.acocod AND p4.acoparnum = v.acoparnum
                         AND p4.devcod = v.devcod AND p4.carcod  = v.carcod`,
    [],
    120_000,
  );
  const vencidas = N(r.vencidas);
  const c2 = N(r.casa_com_2);
  const c4 = N(r.casa_com_4);
  console.log(`   parcelas vencidas (180d) ... ${br(vencidas)}`);
  console.log(`   valor .................... ${dinheiro(N(r.valor_vencido))}`);
  console.log(`   com baixa, join de 2 ..... ${br(c2)}  ${pct(c2, vencidas)}`);
  console.log(`   com baixa, join de 4 ..... ${br(c4)}  ${pct(c4, vencidas)}`);
  console.log(
    `   → falsos positivos evitados pelo join de 4: ${br(c2 - c4)}  ${pct(c2 - c4, c2)} do que o de 2 marcava`,
  );
  return { vencidas, c2, c4 };
}

/**
 * 3. `operacao` como segunda opinião.
 *
 * Ela tem `opeacocod` (o acordo) e ~R$ 112M — mais que `boleto_baixa`. Não serve
 * para dizer QUAL parcela foi paga, porque não guarda o número dela; serve para
 * responder outra coisa, que é o que interessa aqui: existe acordo com dinheiro
 * entrando cujas parcelas o join de boleto marca como todas em aberto? Se
 * existir muito, a dedução do painel está subcontando pagamento.
 */
async function segundaOpiniao() {
  titulo("3. operacao — há acordo recebendo que o boleto não vê?");
  const [r] = await consultaRelatorio<Record<string, unknown>>(
    `WITH venc AS (
       SELECT ap.acocod, ap.acoparnum, a.devcod, a.carcod
         FROM acordo_parcela ap
         JOIN acordo a ON a.acocod = ap.acocod
        WHERE a.acoati = 0
          AND ap.acoparvallan > 0
          AND ap.acopardatven <  CURRENT_DATE
          AND ap.acopardatven >= CURRENT_DATE - INTERVAL '180 days'
     ), pago4 AS (
       SELECT DISTINCT bo.bolcon AS acocod, bo.bolpar AS acoparnum,
              bo.boldevcod AS devcod, bo.bolcarcod AS carcod
         FROM boleto bo
         JOIN boleto_baixa bb ON bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0
     ), aberto AS (
       SELECT v.acocod
         FROM venc v
         LEFT JOIN pago4 p ON p.acocod = v.acocod AND p.acoparnum = v.acoparnum
                          AND p.devcod = v.devcod AND p.carcod    = v.carcod
        WHERE p.acocod IS NULL
        GROUP BY v.acocod
     )
     SELECT count(*)::int AS acordos_em_aberto,
            count(*) FILTER (WHERE o.acocod IS NOT NULL)::int AS com_recebimento,
            COALESCE(sum(o.recebido), 0)::float8 AS valor_recebido
       FROM aberto a
       LEFT JOIN (
         SELECT opeacocod AS acocod, sum(opevalrec)::float8 AS recebido
           FROM operacao
          WHERE opevalrec > 0
            AND opedatpag >= CURRENT_DATE - INTERVAL '180 days'
          GROUP BY 1
       ) o ON o.acocod = a.acocod`,
    [],
    120_000,
  );
  const abertos = N(r.acordos_em_aberto);
  const comRec = N(r.com_recebimento);
  console.log(`   acordos com parcela "em aberto" ... ${br(abertos)}`);
  console.log(
    `   desses, com recebimento em operacao ... ${br(comRec)}  ${pct(comRec, abertos)}`,
  );
  console.log(`   valor recebido neles .............. ${dinheiro(N(r.valor_recebido))}`);
  return { abertos, comRec };
}

/** 4. Uma amostra por carteira, para conferir contra o PDF que o Siscobra imprime. */
async function amostra() {
  titulo("4. Amostra por carteira — confira estas linhas contra o relatório oficial");
  const linhas = await consultaRelatorio<Record<string, unknown>>(
    `WITH venc AS (
       SELECT ap.acocod, ap.acoparnum, ap.acoparvallan, a.devcod, a.carcod
         FROM acordo_parcela ap
         JOIN acordo a ON a.acocod = ap.acocod
        WHERE a.acoati = 0
          AND ap.acoparvallan > 0
          AND ap.acopardatven <  CURRENT_DATE
          AND ap.acopardatven >= CURRENT_DATE - INTERVAL '30 days'
     ), pago4 AS (
       SELECT DISTINCT bo.bolcon AS acocod, bo.bolpar AS acoparnum,
              bo.boldevcod AS devcod, bo.bolcarcod AS carcod
         FROM boleto bo
         JOIN boleto_baixa bb ON bb.bolcodseq = bo.bolcodseq AND bb.bolbaipag > 0
     )
     SELECT COALESCE(ca.carnom, ca.carnomabr) AS carteira,
            count(*)::int AS vencidas,
            count(p.acocod)::int AS com_baixa,
            COALESCE(sum(v.acoparvallan) FILTER (WHERE p.acocod IS NULL), 0)::float8 AS em_aberto
       FROM venc v
       LEFT JOIN pago4 p ON p.acocod = v.acocod AND p.acoparnum = v.acoparnum
                        AND p.devcod = v.devcod AND p.carcod    = v.carcod
       LEFT JOIN carteira ca ON ca.carcod = v.carcod
      GROUP BY 1
      ORDER BY 4 DESC
      LIMIT 12`,
    [],
    120_000,
  );
  if (linhas.length === 0) {
    console.log("   (nenhuma parcela vencida nos últimos 30 dias)");
    return;
  }
  for (const l of linhas) {
    const v = N(l.vencidas);
    console.log(
      `   ${String(l.carteira ?? "(sem carteira)").padEnd(28).slice(0, 28)} ` +
        `${br(v).padStart(6)} vencidas · ${pct(N(l.com_baixa), v).padStart(6)} com baixa · ` +
        `${dinheiro(N(l.em_aberto))} em aberto`,
    );
  }
}

/**
 * O que o resultado autoriza.
 *
 * O corte de 40% não é estatística: é o ponto em que a lista deixa de ser
 * trabalhável. Abaixo dele, quase toda parcela vencida aparece como não paga —
 * o que significa que a baixa não está sendo encontrada, não que a carteira
 * inteira deu calote. Um painel assim não informa nada e ainda parece informar.
 */
function veredito(cob: { vencidas: number; c2: number; c4: number }, seg: {
  abertos: number;
  comRec: number;
}) {
  titulo("Veredito");
  const taxa = cob.vencidas === 0 ? 0 : cob.c4 / cob.vencidas;
  const ruido = seg.abertos === 0 ? 0 : seg.comRec / seg.abertos;

  if (cob.vencidas === 0) {
    console.log("   Sem parcelas vencidas na janela — nada a concluir. Rode com dados.");
    return;
  }
  if (taxa >= 0.4 && ruido <= 0.15) {
    console.log("   ✅ A cadeia fecha. O painel 'em atraso' pode sair sem ressalva forte.");
    console.log("      Registre a taxa medida na decisão 36 e siga.");
  } else if (taxa >= 0.2) {
    console.log("   ⚠️  Cobertura parcial. O painel sai, mas a tela precisa dizer");
    console.log("      'sem baixa localizada' e não 'não pago' — que é o que ela já diz.");
    console.log(`      Cobertura: ${(taxa * 100).toFixed(1)}% · ruído de operacao: ${(ruido * 100).toFixed(1)}%`);
  } else {
    console.log("   ❌ Cobertura baixa demais. NÃO publique o número de atraso como");
    console.log("      valor absoluto: quase tudo apareceria em aberto. Investigue");
    console.log("      `boleto_controle.bolacocod` (link direto acordo↔parcela↔boleto,");
    console.log("      que nenhum diagnóstico do projeto irmão validou) antes de seguir.");
  }
  if (ruido > 0.15) {
    console.log(
      `   ⚠️  ${(ruido * 100).toFixed(1)}% dos acordos "em aberto" têm recebimento em` +
        " `operacao` — o boleto está deixando pagamento passar.",
    );
  }
}

async function main() {
  if (!configSiscobra()) {
    console.error(
      "Siscobra não configurado. Defina DB_HOST, DB_USER, DB_PASSWORD e DB_NAME no .env.",
    );
    process.exit(1);
  }
  console.log("Conferindo a cadeia parcela → boleto → baixa no Siscobra (somente leitura).");
  try {
    await baixas();
    const cob = await cobertura();
    const seg = await segundaOpiniao();
    await amostra();
    veredito(cob, seg);
  } catch (e) {
    console.error(`\nFalhou: ${(e as Error).message}`);
    console.error(
      "Se for tempo esgotado, o CRM está sob carga — repita fora do horário de pico.",
    );
    process.exit(1);
  }
  process.exit(0);
}

void main();
