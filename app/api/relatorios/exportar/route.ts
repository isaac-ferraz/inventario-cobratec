// GET /api/relatorios/exportar — a planilha do recorte que a pessoa montou.
//
// Os mesmos filtros das telas, mais `abas=`. A diferença de fundo em relação a
// `/api/export` (a planilha do inventário) é que aqui cada aba custa uma
// varredura num banco de PRODUÇÃO — e é isso que manda nas três decisões deste
// arquivo:
//
//   1. RECORTE POR PAPEL, com o pedido RECUSADO em vez de atendido pela metade.
//      Pedir uma aba fora do alcance responde 403 dizendo QUAL aba. Entregá-la
//      vazia produziria uma planilha que parece completa e não é — a mesma
//      doença do webhook que a decisão 30 pagou para aprender.
//
//   2. FILA DE TRÊS. O pool do Siscobra é `max: 4` (lib/siscobra.ts). Um
//      `Promise.all` de oito consultas enfileira no pool e as últimas estouram
//      o `connectionTimeoutMillis` de 5s — o erro sairia como "não foi possível
//      consultar o Siscobra", que manda o TI procurar defeito na rede. Três de
//      cada vez deixa uma conexão livre para as TELAS, que continuam sendo
//      usadas enquanto a planilha é gerada.
//
//   3. UMA EXPORTAÇÃO POR USUÁRIO. Um duplo clique num botão que demora 40s é o
//      comportamento normal de quem acha que não funcionou. Sem trava, ele
//      dobra a carga no CRM.
import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirCarteira, podeVerOperadoras } from "@/lib/autorizacao";
import { configSiscobra } from "@/lib/siscobra";
import {
  hojeNoBrasil,
  resolverJanela,
  resolverPeriodo,
  rotuloPeriodo,
} from "@/lib/relatorios";
import { MAX_CODIGOS, recorteDaUrl } from "@/lib/relatorios-filtros";
import {
  acionamentosDe,
  acordosDo,
  carteiras,
  equipes,
  operadoras,
} from "@/lib/relatorios-cobranca";
import {
  aVencerEm,
  emAtrasoAte,
  listarParcelas,
  primeiraParcelaDe,
  quebrasDe,
} from "@/lib/relatorios-carteira";
import { comissaoDe, comissaoDisponivel } from "@/lib/relatorios-comissao";
import {
  ABAS,
  abaDe,
  fontesDe,
  gerarWorkbookRelatorios,
  nomeDoArquivo,
  type AbaChave,
  type Contexto,
  type DadosDaPlanilha,
  type Fonte,
  type Papel,
} from "@/lib/excel-relatorios";

export const dynamic = "force-dynamic";

/** O mesmo teto da lista nominal da tela — ver `listarParcelas`. */
const LIMITE_PARCELAS = 300;

/** Quantas consultas ao CRM ao mesmo tempo. Ver a nota 2 do cabeçalho. */
const CONCORRENCIA = 3;

/** Timeout por consulta. Maior que o das telas: aqui ninguém espera olhando. */
const TIMEOUT_MS = 60_000;

/**
 * Quem já está exportando.
 *
 * Em memória, por instância — a mesma limitação anotada em `chat-eventos.ts` e
 * no agendador. Para o que ela serve (impedir o duplo clique de uma pessoa)
 * isso basta; ela não é um limitador de carga global e não se propõe a ser.
 */
const exportando = new Set<string>();

/**
 * Roda as tarefas em fila de N, sem dependência externa.
 *
 * Uma falha derruba o pedido inteiro (não há `allSettled` aqui de propósito):
 * meia planilha com três abas silenciosamente ausentes é pior que um erro.
 */
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

export async function GET(req: Request) {
  // O portão largo (admin, supervisor e cobrança) só barra o operador de
  // helpdesk; o corte fino é por aba, logo abaixo.
  const auth = await exigirCarteira(req);
  if ("resposta" in auth) return auth.resposta;
  const papel = auth.usuario.papel as Papel;

  if (!configSiscobra()) {
    return erro(
      "Exportação indisponível: a conexão com o Siscobra não está configurada.",
      503,
    );
  }

  const url = new URL(req.url);
  const hoje = hojeNoBrasil();

  // ─── as duas janelas ───
  //
  // Acordo e comissão olham para TRÁS ("o que fechou"); a carteira olha para
  // FRENTE ("o que vence"). Uma janela só forçaria uma das duas metades a
  // mentir, então a planilha carrega as duas e a aba Parâmetros diz qual vale
  // para o quê.
  const periodo = resolverPeriodo(
    {
      periodo: url.searchParams.get("periodo"),
      inicio: url.searchParams.get("inicio"),
      fim: url.searchParams.get("fim"),
    },
    hoje,
  );
  if (!periodo.ok) return erro(periodo.erro);

  const janela = resolverJanela(
    {
      janela: url.searchParams.get("janela"),
      inicio: url.searchParams.get("janelaInicio"),
      fim: url.searchParams.get("janelaFim"),
    },
    hoje,
  );
  if (!janela.ok) return erro(janela.erro);

  const recorte = recorteDaUrl(url.searchParams);
  if (!recorte) {
    return erro(
      `Filtro de carteira, equipe ou operadora inválido (no máximo ${MAX_CODIGOS} códigos, separados por vírgula).`,
    );
  }
  if (recorte.operadoras && !podeVerOperadoras(papel)) {
    return erro("Seu perfil não recorta o relatório por operadora.", 403);
  }

  // ─── as abas pedidas ───
  const pedidas = (url.searchParams.get("abas") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pedidas.length === 0) {
    return erro("Escolha ao menos uma aba para exportar.");
  }
  if (pedidas.length > ABAS.length) {
    return erro("Lista de abas inválida.");
  }

  const abas: AbaChave[] = [];
  for (const chave of pedidas) {
    const def = abaDe(chave);
    if (!def) return erro(`Aba desconhecida: “${chave}”.`);
    if (!def.papeis.includes(papel)) {
      // Nomear a aba é o ponto: "403" sozinho manda a pessoa adivinhar qual das
      // quinze caixinhas ela não podia ter marcado.
      return erro(`Seu perfil não alcança a aba “${def.nome}”.`, 403);
    }
    if (!abas.includes(def.chave)) abas.push(def.chave);
  }
  // "Parâmetros" entra sempre, mesmo sem ser pedida: uma planilha de números sem
  // o recorte que os produziu vira um número sem dono na primeira vez que
  // alguém a encaminha.
  if (!abas.includes("parametros")) abas.unshift("parametros");

  const fontes = fontesDe(abas);
  if (fontes.length === 0) {
    return erro("Escolha ao menos uma aba com dados — só a capa não é relatório.");
  }

  const trava = auth.usuario.id;
  if (exportando.has(trava)) {
    return erro(
      "Já existe uma exportação sua em andamento. Espere ela terminar.",
      429,
    );
  }
  exportando.add(trava);

  try {
    const filtro = { inicio: periodo.inicio, fim: periodo.fim, ...recorte };
    const soRecorte = recorte;
    const dados: DadosDaPlanilha = {};

    // A comissão pode simplesmente não existir nesta instalação do Siscobra.
    // Perguntar antes evita um "relation does not exist" que se lê como CRM fora
    // do ar; a aba some e a planilha sai com o resto.
    const querComissao = fontes.includes("comissao");
    const temComissao = querComissao ? await comissaoDisponivel() : false;
    if (querComissao && !temComissao) {
      return erro(
        "Esta instalação do Siscobra não tem o módulo de comissão — desmarque as abas de comissão.",
        503,
      );
    }

    const tarefas: { fonte: Fonte; rodar: () => Promise<void> }[] = [
      {
        fonte: "acordos",
        rodar: async () => {
          dados.acordos = await acordosDo(filtro, TIMEOUT_MS);
        },
      },
      {
        fonte: "acionamentos",
        rodar: async () => {
          dados.acionamentos = await acionamentosDe(filtro, TIMEOUT_MS);
        },
      },
      {
        fonte: "aVencer",
        rodar: async () => {
          dados.aVencer = await aVencerEm(
            { ...soRecorte, inicio: janela.inicio, fim: janela.fim },
            hoje,
            TIMEOUT_MS,
          );
        },
      },
      {
        fonte: "atraso",
        rodar: async () => {
          dados.atraso = await emAtrasoAte(soRecorte, hoje, TIMEOUT_MS);
        },
      },
      {
        fonte: "quebras",
        rodar: async () => {
          dados.quebras = await quebrasDe(soRecorte, hoje, TIMEOUT_MS);
        },
      },
      {
        fonte: "primeira",
        rodar: async () => {
          dados.primeira = await primeiraParcelaDe(soRecorte, hoje, TIMEOUT_MS);
        },
      },
      {
        fonte: "comissao",
        rodar: async () => {
          dados.comissao = await comissaoDe(filtro, TIMEOUT_MS);
        },
      },
      {
        fonte: "parcelas",
        rodar: async () => {
          const p = await listarParcelas(
            { ...soRecorte, inicio: janela.inicio, fim: janela.fim },
            hoje,
            LIMITE_PARCELAS,
            TIMEOUT_MS,
          );
          dados.parcelas = p;
          dados.parcelasTruncadas = p.length >= LIMITE_PARCELAS;
        },
      },
    ];

    await emFila(
      tarefas.filter((t) => fontes.includes(t.fonte)).map((t) => t.rodar),
      CONCORRENCIA,
    );

    // ─── os códigos viram nomes ───
    //
    // A aba Parâmetros mostra "FESTCARD, COOPERATIVAS", não "7, 15". As três
    // listas vêm do cache de uma hora que as telas já usam — nenhuma consulta a
    // mais bate no CRM por causa disto. Falha aqui não derruba a planilha: sem
    // os nomes, os códigos servem.
    const nomes = { carteiras: [] as string[], equipes: [] as string[], operadoras: [] as string[] };
    try {
      const [lc, le, lo] = await Promise.all([
        recorte.carteiras ? carteiras() : Promise.resolve([]),
        recorte.equipes ? equipes() : Promise.resolve([]),
        recorte.operadoras ? operadoras() : Promise.resolve([]),
      ]);
      const traduzir = (
        cods: number[] | null,
        lista: { cod: number; nome: string }[],
      ) =>
        (cods ?? []).map(
          (c) => lista.find((l) => l.cod === c)?.nome ?? `código ${c}`,
        );
      nomes.carteiras = traduzir(recorte.carteiras, lc);
      nomes.equipes = traduzir(recorte.equipes, le);
      nomes.operadoras = traduzir(recorte.operadoras, lo);
    } catch {
      const cru = (cods: number[] | null) => (cods ?? []).map((c) => `código ${c}`);
      nomes.carteiras = cru(recorte.carteiras);
      nomes.equipes = cru(recorte.equipes);
      nomes.operadoras = cru(recorte.operadoras);
    }

    const ctx: Contexto = {
      periodo: {
        inicio: periodo.inicio,
        fim: periodo.fim,
        rotulo: rotuloPeriodo(periodo.inicio, periodo.fim, hoje),
      },
      janela: {
        inicio: janela.inicio,
        fim: janela.fim,
        rotulo: rotuloPeriodo(janela.inicio, janela.fim, hoje),
      },
      hoje,
      filtro,
      recorte: nomes,
      exportadoPor: auth.usuario.login,
      exportadoEm: new Date(),
      abas,
    };

    const buffer = await gerarWorkbookRelatorios(ctx, dados);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeDoArquivo(ctx)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    console.error("[relatorios] exportar:", msg);
    if (/statement timeout|canceling statement/i.test(msg)) {
      return erro(
        "A consulta demorou demais no CRM. Reduza o período ou marque menos abas.",
        504,
      );
    }
    return erro("Não foi possível gerar a planilha agora.", 502);
  } finally {
    exportando.delete(trava);
  }
}
