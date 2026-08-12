-- ═══════════════════════════════════════════════════════════════════════════
-- Consultas do chatbot ao Siscobra (PostgreSQL, SOMENTE LEITURA).
--
-- Este arquivo é a REFERÊNCIA das consultas, e elas rodam em dois lugares:
--   • `lib/siscobra.ts`, no próprio inventário (decisão 32) — é o caminho de
--     hoje, e o que alimenta os moldes de resposta do robô;
--   • nos nós Postgres do n8n, se um dia o fluxo dele for montado.
--
-- A decisão 28 dizia que o inventário NUNCA abriria conexão com o Siscobra, e a
-- 32 reverteu isso: sem dado, o robô inventava. A fronteira ficou mais estreita
-- em vez de sumir — somente leitura, consultas fixas, e o dado NÃO vai para o
-- modelo (ver o cabeçalho de lib/siscobra.ts).
--
-- Derivadas de `siscobra_postgresql/sql/exploration/negocie_lookup_devedor.sql`,
-- validado ao vivo em 2026-07-21. As armadilhas abaixo NÃO são teoria: são
-- colunas que existem, têm nome convincente e estão erradas neste banco.
--
--   • Dívida em aberto = `contrato.conati = 0` (conati=1 é QUITADO).
--     O saldo está em `convalsal`. `convalconatu` e `convalcon` estão
--     DENORMALIZADOS e ZERADOS — usá-los faria o robô dizer "você deve R$ 0,00".
--   • "Vencido desde" real = `devedor.devvenmaisantigo`.
--     `contrato.convenmaisantigo` é sentinela `0001-01-01`.
--   • Regra ativa = `acordo_regras.regacoati = 1`. As datas de vigência também
--     são sentinela → NÃO filtrar por vigência, senão nenhuma regra aparece.
--   • `devedor.devcpf` é BIGINT sem máscara e sem zeros à esquerda.
--   • `retorno` tem 55M linhas → SEMPRE com janela de data.
--
-- SEGURANÇA/LGPD: usuário do banco com GRANT SELECT apenas. O CPF nunca é
-- devolvido inteiro nem registrado em log — só mascarado, e a identificação
-- exige CPF **E** data de nascimento (anti-enumeração).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) PALPITE por telefone — quem PODE ser este número.
--
-- Serve para a saudação ("Falo com Maria?"), NUNCA para liberar valor: o
-- telefone pode ter trocado de dono. O resultado daqui vai para o inventário
-- como `siscobraDevcod` SEM `identificado: true`.
-- ───────────────────────────────────────────────────────────────────────────
-- $1 = telefone só com dígitos, sem o 55 (ex.: '12997654321')
SELECT DISTINCT
    d.devcod,
    d.carcod,
    ca.carnom                                   AS carteira,
    split_part(d.devnom, ' ', 1)                AS primeiro_nome
FROM telefone t
JOIN pessoa  p  ON p.pescod = t.pescod
JOIN devedor d  ON d.pescod = p.pescod
JOIN carteira ca ON ca.carcod = d.carcod
WHERE regexp_replace(t.telnum::text, '\D', '', 'g') LIKE '%' || $1
  AND d.devsalatu > 0
LIMIT 5;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) IDENTIFICAÇÃO — CPF **e** data de nascimento.
--
-- Esta é a única consulta que autoriza falar de valores. O n8n só manda
-- `identificado: true` para o inventário quando ela devolve exatamente uma
-- carteira; devolvendo várias, o robô pergunta de qual dívida se trata.
-- ───────────────────────────────────────────────────────────────────────────
-- $1 = CPF (com ou sem máscara)   $2 = nascimento 'AAAA-MM-DD'
SELECT
    d.devcod,
    d.carcod,
    ca.carnom                                          AS carteira,
    split_part(d.devnom, ' ', 1)                       AS primeiro_nome,
    left(lpad(d.devcpf::text, 11, '0'), 3) || '.***.***-'
      || right(lpad(d.devcpf::text, 11, '0'), 2)       AS cpf_mascarado,
    d.devsalatu                                        AS saldo_devedor,
    CASE WHEN d.devvenmaisantigo >= DATE '2000-01-01'
         THEN d.devvenmaisantigo END                   AS vencido_desde
FROM devedor d
JOIN carteira ca ON ca.carcod = d.carcod
WHERE d.devcpf   = regexp_replace($1, '\D', '', 'g')::bigint
  AND d.devdatnas = $2::date
ORDER BY d.carcod;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) DOSSIÊ — o que a operadora vê ao lado da conversa.
--
-- Um objeto só, porque é isso que o inventário guarda em `Conversa.dossie`.
-- As chaves aqui viram os rótulos da tela (app/chat/console.tsx).
-- ───────────────────────────────────────────────────────────────────────────
-- $1 = devcod   $2 = carcod
SELECT json_build_object(
    'carteira',        ca.carnom,
    'saldoDevedor',    d.devsalatu,
    'vencidoDesde',    CASE WHEN d.devvenmaisantigo >= DATE '2000-01-01'
                            THEN to_char(d.devvenmaisantigo, 'DD/MM/YYYY') END,
    'contratos',       (
        SELECT count(*) FROM contrato c
        WHERE c.devcod = d.devcod AND c.conati = 0 AND c.convalsal > 0
    ),
    'saldoContratos',  (
        -- `convalsal`, e não convalconatu/convalcon (zerados neste snapshot).
        SELECT coalesce(sum(c.convalsal), 0) FROM contrato c
        WHERE c.devcod = d.devcod AND c.conati = 0 AND c.convalsal > 0
    ),
    'ultimoContato',   (
        -- Janela obrigatória: `retorno` tem 55M linhas.
        SELECT to_char(max(r.retdatinc), 'DD/MM/YYYY') FROM retorno r
        WHERE r.devcod = d.devcod
          AND r.retdatinc > now() - interval '18 months'
    )
) AS dossie
FROM devedor d
JOIN carteira ca ON ca.carcod = d.carcod
WHERE d.devcod = $1 AND d.carcod = $2;


-- ───────────────────────────────────────────────────────────────────────────
-- 4) REGRA OFICIAL DA CARTEIRA — a trava do robô.
--
-- É o documento oficial do parcelamento. O robô só fecha DENTRO disto, e o
-- resultado alimenta `propostaCabeNaRegra` (lib/conversas.ts) no inventário.
--
-- Carteira SEM regra ativa devolve zero linhas — e aí o robô NÃO negocia:
-- escala para a operadora. Cerca de 20 carteiras têm regra ativa; nas demais,
-- inventar condição seria pior que passar para gente.
-- ───────────────────────────────────────────────────────────────────────────
-- $1 = carcod
SELECT
    r.regacocod,
    -- Máximo de parcelas que o OPERADOR pode dar (o robô não passa disto).
    r.regacoparmaxope                       AS max_parcelas,
    -- Piso de parcela e teto de desconto vêm do ladder, por nº de parcelas.
    min(rp.regacovalparmin)                 AS valor_minimo_parcela,
    max(rp.regacoperdesmax)                 AS desconto_maximo_percentual
FROM acordo_regras r
LEFT JOIN acordo_regras_parcela rp
       ON rp.carcod = r.carcod AND rp.regacocod = r.regacocod
WHERE r.carcod = $1
  AND r.regacoati = 1
  -- Sem filtro de vigência: regacodatini/fim são sentinela '0001-01-01' e
  -- filtrar por elas descartaria TODAS as regras.
GROUP BY r.regacocod, r.regacoparmaxope;
