// Leitura do Siscobra (PostgreSQL do CRM) — a única porta do inventário para lá.
//
// ─────────────────────── isto reverte a decisão 28 ───────────────────────
//
// A decisão 28 dizia, com todas as letras: "o inventário NÃO abre conexão com o
// Siscobra". O dossiê chegava empurrado pelo n8n. Aquele desenho supunha o n8n
// como chatbot; sem ele, a alternativa era o robô não ter dado nenhum — que é
// exatamente o que o fez inventar (decisão 31.2). Ver ADR 32.
//
// A fronteira não sumiu; mudou de lugar e ficou mais estreita:
//
//   • SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE existe neste arquivo, e o
//     usuário do banco deve ter apenas GRANT SELECT. Acordo fechado continua
//     sendo gravado pela operadora no Siscobra — o robô não escreve no CRM.
//   • CONSULTAS FIXAS. Três, parametrizadas, escritas aqui. Não existe caminho
//     por onde SQL montada com texto do devedor chegue ao banco.
//   • NADA VAI PARA O MODELO. O que sai daqui alimenta os moldes de
//     `chat-respostas.ts`. O modelo classifica intenção e nunca vê estes campos
//     (decisão 32) — é o que mantém dado do devedor dentro da empresa mesmo com
//     o modelo rodando fora dela.
//
// As armadilhas comentadas abaixo não são teoria: são colunas que existem, têm
// nome convincente e estão erradas neste banco. Vieram de
// `docs/conversas/siscobra.sql`.
//
// As três consultas foram RODADAS contra o Siscobra em 12/08/2026, com
// parâmetros que não retornam ninguém — e foi assim que se descobriu que a
// consulta de telefone daquele arquivo nunca havia sido executada (ver abaixo).
// SQL que ninguém rodou é SQL que não funciona.
import { Pool } from "pg";

let pool: Pool | null = null;

export function configSiscobra(): boolean {
  return !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

function conexao(): Pool | null {
  if (!configSiscobra()) return null;
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // Poucas conexões: o CRM é de produção e atende gente trabalhando. O
      // chatbot é visita, não morador.
      max: 4,
      idleTimeoutMillis: 30_000,
      // Consulta que demora mais que isto não serve para uma conversa de
      // WhatsApp — melhor escalar do que segurar o devedor esperando.
      connectionTimeoutMillis: 5_000,
      statement_timeout: 8_000,
    });
    pool.on("error", (e) => console.error("[siscobra] pool:", e.message));
  }
  return pool;
}

export type Identificacao = {
  devcod: number;
  carcod: number;
  carteira: string;
  primeiroNome: string | null;
  cpfMascarado: string;
  saldo: number;
  vencidoDesde: string | null;
};

/**
 * O quadro que a operadora tem à frente ao assumir a conversa.
 *
 * A ordem das chaves é a ordem em que a tela desenha, e ela segue o que a
 * pessoa precisa PRIMEIRO: com quem estou falando, e sobre o quê. O CPF vem
 * **mascarado** de propósito — serve para conferir com o devedor ("termina em
 * 25?") sem duplicar um dado pessoal inteiro num segundo sistema. Quem precisa
 * do cadastro completo abre pelo `devcod`, que também está aqui.
 */
export type Dossie = {
  nome: string | null;
  cpf: string | null;
  carteira: string;
  saldoDevedor: number;
  vencidoDesde: string | null;
  contratos: number;
  saldoContratos: number;
  ultimoContato: string | null;
};

export type RegraCarteiraDb = {
  maxParcelas: number | null;
  valorMinimoParcela: number | null;
  descontoMaximoPercentual: number | null;
};

// ─── o que este arquivo NÃO tem, e é decisão ───
//
// Não existe consulta "quem é este telefone". A referência em
// `docs/conversas/siscobra.sql` traz uma (para saudar por nome antes de
// identificar), e ela ficou de fora: número troca de dono, e responder "Olá,
// Maria!" a quem herdou a linha confirma a um estranho que a Maria é devedora.
// É vazamento pelo caminho mais banal possível — o da simpatia.
//
// O nome continua sendo usado, no lugar em que ele é seguro: depois de CPF e
// nascimento conferidos, quando já se sabe com quem se está falando.

/**
 * O primeiro nome do devedor, sem o código de cadastro que vem grudado nele.
 *
 * O `devnom` do Siscobra às vezes traz um código antes do nome — ora separado
 * por espaço ("40067713 ANA CLAUDIA DE ARRUDA MELO"), ora **colado**
 * ("735705Violene Badio"). Aqui havia um `split_part(devnom, ' ', 1)`, que dá
 * conta da primeira forma e não da segunda: com ela, o robô cumprimentava
 * "Olá, 735705Violene!" na cara do devedor.
 *
 * **Duas ou mais casas, e não uma.** O corte é aí por causa do que o banco tem:
 * um único dígito inicial é razão social de verdade — "7M INSTALACOES LTDA",
 * "3F SERVICOS INDUSTRIAIS", "3C SERVICES", "2RA CORRETORA", "3G MEDIC". Cortar
 * um só transformaria "7M" em "M". Já as corridas de 2+ dígitos, no que se
 * amostrou, são sempre código de cadastro (6 a 8 casas).
 *
 * **Dígito no MEIO da palavra fica.** "SANT0S", "C0RREIAS" e "RODRIG8UES" são
 * erro de digitação (zero no lugar do O), não código: limpar ali produziria
 * "SANTS". Estragar o nome é pior que entregá-lo como está.
 *
 * Sobrando nada, devolve `null` — e a saudação cai no "Olá!" sem nome, que já é
 * o comportamento de quem não tem nome no cadastro.
 */
export function primeiroNomeDe(devnom: string | null | undefined): string | null {
  if (!devnom) return null;
  const semCodigo = devnom.replace(/^\d{2,}\s*/, "").trim();
  const primeiro = semCodigo.split(/\s+/)[0] ?? "";
  // O código também aparece grudado no FIM ("Felipe Da Silva Malta633370").
  // Quando o cadastro tem uma palavra só, esse fim é o próprio primeiro nome.
  return primeiro.replace(/\d{2,}$/, "").trim() || null;
}

/**
 * A única consulta que autoriza falar de valores: CPF **e** nascimento.
 *
 * Os dois juntos são anti-enumeração — com só o CPF, quem tivesse uma lista
 * deles descobriria quem é devedor e quanto deve.
 *
 * Devolvendo mais de uma linha, são carteiras diferentes: o robô não escolhe
 * uma, porque escolher errado é falar do contrato errado. Vai para gente.
 */
export async function identificar(
  cpf: string,
  nascimento: string,
): Promise<{ achou: Identificacao[]; erro: boolean }> {
  const db = conexao();
  if (!db) return { achou: [], erro: true };

  try {
    const r = await db.query(
      // O nome vem inteiro e é limpo no TypeScript, por `primeiroNomeDe`: a
      // regra tem exceção (razão social que começa com dígito) e regra com
      // exceção precisa de teste — coisa que SQL embutida em string não tem.
      `SELECT d.devcod, d.carcod, ca.carnom AS carteira,
              d.devnom AS nome_cadastro,
              left(lpad(d.devcpf::text, 11, '0'), 3) || '.***.***-'
                || right(lpad(d.devcpf::text, 11, '0'), 2) AS cpf_mascarado,
              d.devsalatu AS saldo,
              -- devvenmaisantigo é o vencimento REAL; contrato.convenmaisantigo
              -- é sentinela '0001-01-01' e mentiria a data para o devedor.
              CASE WHEN d.devvenmaisantigo >= DATE '2000-01-01'
                   THEN to_char(d.devvenmaisantigo, 'DD/MM/YYYY') END AS vencido_desde
         FROM devedor d
         JOIN carteira ca ON ca.carcod = d.carcod
        WHERE d.devcpf = regexp_replace($1, '\\D', '', 'g')::bigint
          AND d.devdatnas = $2::date
        ORDER BY d.carcod
        LIMIT 10`,
      [cpf, nascimento],
    );

    return {
      erro: false,
      achou: r.rows.map((x) => ({
        devcod: Number(x.devcod),
        carcod: Number(x.carcod),
        carteira: String(x.carteira ?? ""),
        // O nome completo NÃO entra no objeto: o robô só precisa do primeiro,
        // e o que não sai daqui não vaza adiante por descuido.
        primeiroNome: primeiroNomeDe(
          x.nome_cadastro ? String(x.nome_cadastro) : null,
        ),
        cpfMascarado: String(x.cpf_mascarado ?? ""),
        saldo: Number(x.saldo ?? 0),
        vencidoDesde: x.vencido_desde ? String(x.vencido_desde) : null,
      })),
    };
  } catch (e) {
    // Log sem CPF e sem nascimento: log de servidor não é lugar de dado
    // pessoal, e este é justamente o caminho por onde eles passam (decisão 30).
    console.error("[siscobra] identificar:", (e as Error).message);
    return { achou: [], erro: true };
  }
}

/** O dossiê que a operadora vê ao lado da conversa. */
export async function dossieDe(
  devcod: number,
  carcod: number,
): Promise<Dossie | null> {
  const db = conexao();
  if (!db) return null;
  try {
    const r = await db.query(
      `SELECT d.devnom AS nome,
              -- Mascarado na CONSULTA, não na tela: assim o CPF inteiro nunca
              -- chega a trafegar nem a ser gravado do lado do inventário.
              left(lpad(d.devcpf::text, 11, '0'), 3) || '.***.***-'
                || right(lpad(d.devcpf::text, 11, '0'), 2) AS cpf,
              ca.carnom AS carteira,
              d.devsalatu AS saldo_devedor,
              CASE WHEN d.devvenmaisantigo >= DATE '2000-01-01'
                   THEN to_char(d.devvenmaisantigo, 'DD/MM/YYYY') END AS vencido_desde,
              -- conati = 0 é EM ABERTO (1 é quitado), e o saldo está em
              -- convalsal: convalconatu/convalcon estão zerados neste banco e
              -- fariam o robô dizer "você deve R$ 0,00".
              (SELECT count(*) FROM contrato c
                WHERE c.devcod = d.devcod AND c.conati = 0 AND c.convalsal > 0) AS contratos,
              (SELECT coalesce(sum(c.convalsal), 0) FROM contrato c
                WHERE c.devcod = d.devcod AND c.conati = 0 AND c.convalsal > 0) AS saldo_contratos,
              -- Janela obrigatória: a tabela retorno tem 55M linhas.
              (SELECT to_char(max(r2.retdatinc), 'DD/MM/YYYY') FROM retorno r2
                WHERE r2.devcod = d.devcod
                  AND r2.retdatinc > now() - interval '18 months') AS ultimo_contato
         FROM devedor d
         JOIN carteira ca ON ca.carcod = d.carcod
        WHERE d.devcod = $1 AND d.carcod = $2`,
      [devcod, carcod],
    );
    const x = r.rows[0];
    if (!x) return null;
    return {
      nome: x.nome ? String(x.nome) : null,
      cpf: x.cpf ? String(x.cpf) : null,
      carteira: String(x.carteira ?? ""),
      saldoDevedor: Number(x.saldo_devedor ?? 0),
      vencidoDesde: x.vencido_desde ? String(x.vencido_desde) : null,
      contratos: Number(x.contratos ?? 0),
      saldoContratos: Number(x.saldo_contratos ?? 0),
      ultimoContato: x.ultimo_contato ? String(x.ultimo_contato) : null,
    };
  } catch (e) {
    console.error("[siscobra] dossiê:", (e as Error).message);
    return null;
  }
}

/**
 * A regra oficial de parcelamento da carteira — o documento que autoriza o robô
 * a oferecer qualquer coisa.
 *
 * Carteira sem regra ativa devolve `null`, e aí o robô **não negocia**: escala.
 * A maioria das carteiras não tem regra ativa; inventar condição para elas
 * seria o pior erro possível deste sistema, porque cria obrigação para a
 * empresa perante o devedor.
 */
export async function regraDaCarteira(
  carcod: number,
): Promise<RegraCarteiraDb | null> {
  const db = conexao();
  if (!db) return null;
  try {
    const r = await db.query(
      `SELECT r.regacoparmaxope        AS max_parcelas,
              min(rp.regacovalparmin)  AS valor_minimo_parcela,
              max(rp.regacoperdesmax)  AS desconto_maximo_percentual
         FROM acordo_regras r
         LEFT JOIN acordo_regras_parcela rp
                ON rp.carcod = r.carcod AND rp.regacocod = r.regacocod
        WHERE r.carcod = $1
          AND r.regacoati = 1
        -- Sem filtro de vigência de propósito: regacodatini/fim são sentinela
        -- '0001-01-01' e filtrar por elas descartaria TODAS as regras.
        GROUP BY r.regacocod, r.regacoparmaxope
        ORDER BY r.regacocod
        LIMIT 1`,
      [carcod],
    );
    const x = r.rows[0];
    if (!x) return null;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      maxParcelas: num(x.max_parcelas),
      valorMinimoParcela: num(x.valor_minimo_parcela),
      descontoMaximoPercentual: num(x.desconto_maximo_percentual),
    };
  } catch (e) {
    console.error("[siscobra] regra:", (e as Error).message);
    return null;
  }
}
