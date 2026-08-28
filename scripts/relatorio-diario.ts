// O relatório diário de uma carteira, em um comando.
//
// Rodar:  npm run relatorio:diario -- --carteira 1163
// (precisa estar dentro da rede da Cobratec — o CRM só atende na LAN)
//
// ─────────────────────────────── por que existe ───────────────────────────────
//
// A exportação da decisão 39 já monta a planilha, mas por HTTP, com sessão, a
// partir do recorte que alguém montou na tela. O relatório diário é o contrário
// disso: sempre a mesma carteira, sempre o dia anterior, sem ninguém escolhendo
// nada — e quem o dispara é um agente, não uma pessoa com um navegador aberto.
//
// ─────────────── a saída é JSON, e é isso que faz o agente honesto ───────────────
//
// O comando imprime UM objeto JSON no stdout com os números que ele acabou de
// gerar. Sem isso, o agente teria de reabrir o .xlsx para descobrir o que
// escrever no e-mail — ou, o que é pior, escrever de memória. Os números do
// texto e os números do anexo saem da mesma leitura do banco, e é essa a razão
// de o JSON existir.
//
// Todo o resto (progresso, aviso, erro) vai para o **stderr**: o stdout tem de
// ser um JSON e nada mais, senão o `JSON.parse` do outro lado quebra na primeira
// linha de log.
//
// ─────────────────── o zero aqui é uma resposta, não um defeito ───────────────────
//
// A carteira 1163 (Rede Drogal) entrou em 21/08/2026 e ainda não teve acordo
// nenhum. Um dia sem movimento é legítimo — mas indistinguível de um cano
// quebrado se o programa apenas imprimir zeros. Por isso o JSON carrega `vazio`,
// e o agente é obrigado a dizer isso em português no corpo do e-mail.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { configSiscobra } from "@/lib/siscobra";
import { hojeNoBrasil, formatarDiaBr, rotuloPeriodo, somarDias } from "@/lib/relatorios";
// As regras da linha de comando e a tradução do erro moram em `lib/` porque o
// vitest só varre `lib/**` — regra em `scripts/` é regra sem teste. Aqui fica o
// I/O: rede, disco e os dois canais de saída.
import {
  lerArgumentos,
  nomeDoArquivo,
  explicarErro,
  ondeFicaOSiscobra,
} from "@/lib/relatorio-diario";
import { acordosDo, acionamentosDe, type Filtro } from "@/lib/relatorios-cobranca";
import {
  aVencerEm,
  emAtrasoAte,
  primeiraParcelaDe,
  quebrasDe,
} from "@/lib/relatorios-carteira";
import { comissaoDe, comissaoDisponivel } from "@/lib/relatorios-comissao";
import { baseDaCarteira, carteirasPorCodigo } from "@/lib/relatorios-base";
import { montarEmail, type ResumoDiario } from "@/lib/relatorio-email";
import {
  gerarWorkbookRelatorios,
  type AbaChave,
  type Contexto,
  type DadosDaPlanilha,
  type Publico,
} from "@/lib/excel-relatorios";

/**
 * Timeout por consulta. Maior que o das telas (30s) pelo mesmo motivo da rota de
 * exportação: aqui ninguém está olhando para uma barra de progresso.
 */
const TIMEOUT_MS = 60_000;

/**
 * Quantas consultas ao CRM ao mesmo tempo.
 *
 * Três, e não nove. O pool do Siscobra é `max: 4` (`lib/siscobra.ts`): um
 * `Promise.all` enfileira no pool e as últimas estouram o
 * `connectionTimeoutMillis` de 5s — o erro sairia como "não foi possível
 * consultar o Siscobra", que manda procurar defeito na rede. A quarta conexão
 * fica livre para quem estiver usando as telas.
 */
const CONCORRENCIA = 3;

/**
 * As abas da planilha do cliente.
 *
 * Nenhuma delas escreve nome de gente — é o que `nominal` marca no catálogo em
 * `lib/relatorios-abas.ts`, e o gerador recusa a planilha se alguma entrar aqui
 * por engano. Ficam de fora, de propósito:
 *
 *   • as abas por operadora e a matriz — produção de funcionário é dado da
 *     Cobratec, não do cliente (decisões 27, 35 e 36);
 *   • "Parcelas (nominal)" — nome e CPF de devedor num anexo que sai da empresa;
 *   • "Acordos · mês", que num período de um dia é uma linha só.
 */
const ABAS_CLIENTE: AbaChave[] = [
  "parametros",
  "resumo",
  "carteira-base",
  "acordos-carteira",
  "acordos-hora",
  "acionamentos-situacao",
  "comissao-resumo",
  "carteira-a-vencer",
  "carteira-atraso",
  "carteira-quebras",
  "carteira-primeira",
];

/** A versão para casa: a do cliente mais tudo o que tem nome. */
const ABAS_INTERNAS: AbaChave[] = [
  ...ABAS_CLIENTE,
  "acordos-operadora",
  "acordos-matriz",
  "acionamentos-operadora",
  "comissao",
  "carteira-operadora",
];

/** Roda as tarefas em fila de N. Cópia deliberada da rota de exportação. */
async function emFila<T>(tarefas: (() => Promise<T>)[], n: number): Promise<T[]> {
  const saida: T[] = new Array(tarefas.length);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < tarefas.length) {
      const i = proxima++;
      saida[i] = await tarefas[i]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(n, tarefas.length) }, () => trabalhador()),
  );
  return saida;
}

async function principal(): Promise<void> {
  const hoje = hojeNoBrasil();
  const args = lerArgumentos(process.argv.slice(2), hoje);

  if (!configSiscobra()) {
    throw new Error(
      "Siscobra não configurado (DB_HOST/DB_USER/DB_NAME no .env). " +
        "Rode dentro da rede da Cobratec.",
    );
  }

  console.error(
    `[relatorio-diario] carteira ${args.carteiras.join(",")} · dia ${args.dia} · ` +
      `janela ${args.janelaDias}d · ${args.publico}`,
  );

  // ─── quem é a carteira ───
  //
  // Antes de qualquer número: código que não existe tem de parar aqui. Sem esta
  // conferência, um dígito trocado geraria uma planilha perfeitamente formatada,
  // cheia de zeros, de uma carteira que não existe — e ninguém notaria.
  const identificadas = await carteirasPorCodigo(args.carteiras);
  const faltando = args.carteiras.filter(
    (c) => !identificadas.some((i) => i.cod === c),
  );
  if (faltando.length) {
    throw new Error(
      `Carteira não encontrada no Siscobra: ${faltando.join(", ")}.`,
    );
  }
  const avisos: string[] = [];
  for (const c of identificadas) {
    if (!c.ativa) {
      // Não é erro: a carteira existe e teve movimento no passado. Mas a
      // consulta da base exige carteira ativa, e sem este aviso o saldo zerado
      // se leria como "não há nada para cobrar".
      avisos.push(
        `A carteira ${c.cod} (${c.nome}) está INATIVA no Siscobra — a base ` +
          `(fichas e saldo) sai zerada para ela.`,
      );
    }
  }

  const recorte = { carteiras: args.carteiras, equipes: null, operadoras: null };
  const filtroDia: Filtro = { inicio: args.dia, fim: args.dia, ...recorte };
  // O acumulado do mês vai até o DIA do relatório, não até hoje: o e-mail é o
  // fechamento daquele dia, e incluir o que aconteceu hoje de manhã faria as
  // duas metades do texto discordarem.
  const filtroMes: Filtro = {
    inicio: `${args.dia.slice(0, 7)}-01`,
    fim: args.dia,
    ...recorte,
  };
  const janelaFim = somarDias(hoje, args.janelaDias - 1);

  const temComissao = await comissaoDisponivel();
  if (!temComissao) {
    avisos.push(
      "Esta instalação do Siscobra não tem o módulo de comissão — a aba de " +
        "honorários sai de fora.",
    );
  }

  const d: DadosDaPlanilha = {};
  let acordosMes: { qtd: number; valor: number } = { qtd: 0, valor: 0 };

  const tarefas: (() => Promise<void>)[] = [
    async () => {
      d.acordos = await acordosDo(filtroDia, TIMEOUT_MS);
    },
    async () => {
      d.acionamentos = await acionamentosDe(filtroDia, TIMEOUT_MS);
    },
    async () => {
      d.base = await baseDaCarteira(args.carteiras, TIMEOUT_MS);
    },
    async () => {
      d.aVencer = await aVencerEm(
        { ...recorte, inicio: hoje, fim: janelaFim },
        hoje,
        TIMEOUT_MS,
      );
    },
    async () => {
      d.atraso = await emAtrasoAte(recorte, hoje, TIMEOUT_MS);
    },
    async () => {
      d.quebras = await quebrasDe(recorte, hoje, TIMEOUT_MS);
    },
    async () => {
      d.primeira = await primeiraParcelaDe(recorte, hoje, TIMEOUT_MS);
    },
    async () => {
      const m = await acordosDo(filtroMes, TIMEOUT_MS);
      acordosMes = { qtd: m.qtd, valor: m.valor };
    },
  ];
  if (temComissao) {
    tarefas.push(async () => {
      d.comissao = await comissaoDe(filtroDia, TIMEOUT_MS);
    });
  }

  const comecou = Date.now();
  await emFila(tarefas, CONCORRENCIA);
  console.error(`[relatorio-diario] ${tarefas.length} consultas em ${Date.now() - comecou}ms`);

  // ─── a planilha ───
  const abas = args.publico === "cliente" ? ABAS_CLIENTE : ABAS_INTERNAS;
  const ctx: Contexto = {
    periodo: {
      inicio: args.dia,
      fim: args.dia,
      rotulo: rotuloPeriodo(args.dia, args.dia, hoje),
    },
    janela: {
      inicio: hoje,
      fim: janelaFim,
      rotulo: rotuloPeriodo(hoje, janelaFim, hoje),
    },
    hoje,
    filtro: filtroDia,
    recorte: {
      carteiras: identificadas.map((c) => c.nome),
      equipes: [],
      operadoras: [],
    },
    exportadoPor: "relatório diário automático",
    exportadoEm: new Date(),
    // Sem comissão não adianta pedir a aba: ela sairia vazia dizendo "(nenhum
    // registro)", o que é diferente de "este banco não apura comissão".
    abas: temComissao ? abas : abas.filter((a) => a !== "comissao-resumo" && a !== "comissao"),
    publico: args.publico,
  };

  const buffer = await gerarWorkbookRelatorios(ctx, d);
  const pasta = resolve(args.saida);
  mkdirSync(pasta, { recursive: true });
  const caminho = join(
    pasta,
    nomeDoArquivo(identificadas[0]?.nome ?? "carteira", args.dia, args.publico),
  );
  writeFileSync(caminho, buffer);
  console.error(`[relatorio-diario] ${caminho} (${buffer.length} bytes)`);

  // ─── o JSON ───
  const vazio =
    (d.acordos?.qtd ?? 0) === 0 &&
    (d.acionamentos?.qtd ?? 0) === 0 &&
    (d.comissao?.qtd ?? 0) === 0;

  const resumo: ResumoDiario = {
    carteiras: identificadas,
    dia: args.dia,
    hoje,
    janela: { inicio: hoje, fim: janelaFim, dias: args.janelaDias },
    // Nada aconteceu no dia. Vai para o texto do e-mail como frase, não como
    // zero mudo.
    vazio,
    avisos,
    dia_numeros: {
      acordos: { qtd: d.acordos?.qtd ?? 0, valor: d.acordos?.valor ?? 0 },
      acionamentos: {
        qtd: d.acionamentos?.qtd ?? 0,
        devedores: d.acionamentos?.devedores ?? 0,
      },
      honorarios: d.comissao
        ? {
            qtd: d.comissao.qtd,
            valor: d.comissao.valor,
            recebido: d.comissao.recebido,
            conferida: d.comissao.conferida,
          }
        : null,
    },
    mes: {
      inicio: filtroMes.inicio,
      fim: filtroMes.fim,
      acordos: acordosMes,
    },
    base: d.base
      ? {
          fichas: d.base.fichas,
          contratos: d.base.contratos,
          saldo: d.base.saldo,
          cadastrados: d.base.cadastrados,
        }
      : null,
    carteira_acordos: {
      aVencer: { qtd: d.aVencer?.qtd ?? 0, valor: d.aVencer?.valor ?? 0 },
      venceHoje: d.aVencer?.hoje ?? { qtd: 0, valor: 0 },
      atraso: { qtd: d.atraso?.qtd ?? 0, valor: d.atraso?.valor ?? 0, desde: d.atraso?.desde ?? null },
      quebras: { qtd: d.quebras?.qtd ?? 0, valor: d.quebras?.valor ?? 0 },
      primeiraParcela: {
        avaliados: d.primeira?.avaliados ?? 0,
        pagos: d.primeira?.pagos ?? 0,
      },
    },
  };

  // ─── o e-mail sai pronto daqui ───
  //
  // Assunto, texto e HTML já montados: o agente encaminha, não redige. Ver o
  // cabeçalho de `lib/relatorio-email.ts` — é a decisão 32 outra vez, e o que
  // ela compra é que nenhum número do e-mail passou por um modelo.
  const email = montarEmail(resumo);

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...resumo,
        diaBr: formatarDiaBr(args.dia),
        publico: args.publico,
        arquivo: caminho,
        bytes: buffer.length,
        email,
      },
      null,
      2,
    ),
  );
}

principal()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    // O erro também sai como JSON no stdout: quem chama isto é um agente, e
    // "ok: false" com a mensagem dentro é mais fácil de tratar do que adivinhar
    // pelo código de saída. O texto legível vai no stderr, para gente.
    //
    // A mensagem passa por `explicarErro` porque a crua do `pg` — "Connection
    // terminated due to connection timeout" — é verdadeira e não diz o que
    // fazer. Rodar fora do escritório é o erro MAIS comum deste comando, e o
    // agente repete ao usuário o que estiver aqui.
    const erro = explicarErro(e, ondeFicaOSiscobra());
    console.error(`[relatorio-diario] ERRO: ${erro}`);
    console.log(JSON.stringify({ ok: false, erro }, null, 2));
    process.exit(1);
  });
