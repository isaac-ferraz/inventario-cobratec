// A conversa em si: intenção (do modelo) + dado (do banco) → fala (de molde).
//
// Este arquivo é o robô. Ele decide, a cada mensagem, uma de três coisas:
// responder com um molde, pedir o que falta, ou chamar gente. Nada mais.
//
// ─────────────────── por que ele pode conversar mais ───────────────────
//
// A versão anterior passava para gente quase de imediato, e com razão: sem dado
// nenhum, cada turno a mais era uma chance a mais de o modelo inventar. Agora o
// risco não cresce com o número de turnos, porque nenhum turno é redigido pelo
// modelo — então o robô pode sustentar a conversa inteira até o ponto em que
// uma DECISÃO humana é necessária.
//
// A régua do que ele faz sozinho não é "o quanto ele parece seguro", é:
//   • o dado existe no Siscobra?           → ele informa
//   • a regra oficial da carteira autoriza? → ele oferece
//   • nenhuma das duas?                     → gente, sempre
//
// Onde ele para, e por decisão e não por limitação: fechar acordo (quem grava
// no CRM é a operadora), qualquer coisa fora da regra, e todo assunto onde
// errar tem consequência jurídica — pagamento alegado, contestação, advogado.
import type { Intencao, Leitura } from "@/lib/chat-intencao";
import { exigeGente } from "@/lib/chat-intencao";
import { RESPOSTAS, montarOferta } from "@/lib/chat-respostas";
import { propostaCabeNaRegra } from "@/lib/conversas";
import type { Identificacao, RegraCarteiraDb } from "@/lib/siscobra";

/** O que o fluxo sabe da conversa antes de decidir. */
export type EstadoConversa = {
  /** Identificado = documento + nome do titular conferidos no Siscobra. */
  devcod: number | null;
  carcod: number | null;
  identificadaEm: Date | null;
  nome: string | null;
  /** Saldo congelado na identificação — não se reconsulta a cada fala. */
  saldo: number | null;
  vencidoDesde: string | null;
  /** Quantas saudações o robô já respondeu nesta conversa. */
  saudacoes: number;
  /** Documento já recebido, esperando o nome (ou o contrário). */
  documentoPendente: string | null;
  nomePendente: string | null;
  /**
   * O que o robô já colocou na mesa, ou `null`. Muda o sentido de
   * "aceita"/"recusa" — e é o que a operadora precisa ler ao assumir, para não
   * contradizer o que foi prometido.
   */
  oferta: OfertaFeita | null;
};

// Duas saídas, e só: falar ou chamar gente. A identificação não é uma terceira
// porque, do ponto de vista de quem lê a conversa, ela também é uma fala — a
// diferença é que ela carrega estado novo junto.
export type OfertaFeita = {
  parcelas: number;
  valorParcela: number;
  descontoPercentual: number;
  valorAVista: number;
  /** ISO — a proposta envelhece, e a operadora precisa saber de quando é. */
  em: string;
};

export type Acao =
  | { tipo: "responder"; texto: string; estado?: Partial<EstadoConversa> }
  /**
   * `aviso` é OBRIGATÓRIO, e isso é a regra em forma de tipo.
   *
   * Ele era opcional, e quatro caminhos de escalonamento não o preenchiam — o
   * pior deles: banco fora do ar logo depois de a pessoa mandar o CPF. Ela
   * entregava um dado pessoal e recebia silêncio absoluto, enquanto a conversa
   * ia para a fila sem que ela soubesse. Silêncio depois de uma pergunta é onde
   * o devedor desiste.
   *
   * Exigir o campo faz o compilador cobrar: não dá para acrescentar um
   * escalonamento mudo sem que o build reclame. `motivo` é para a operadora,
   * `aviso` é para o devedor — os dois sempre.
   */
  | { tipo: "escalar"; motivo: string; aviso: string };

/**
 * As consultas que o fluxo precisa. Passadas como parâmetro, e não importadas,
 * para o fluxo inteiro ser testável sem banco nenhum — é aqui que moram as
 * regras, e regra que só se testa com Postgres de pé não se testa.
 */
export type Fontes = {
  identificar: (
    documento: string,
    nome: string,
  ) => Promise<{ achou: Identificacao[]; erro: boolean }>;
  regraDaCarteira: (carcod: number) => Promise<RegraCarteiraDb | null>;
};

const ESTA_IDENTIFICADA = (e: EstadoConversa) =>
  e.devcod !== null && e.identificadaEm !== null;

/**
 * Decide o que fazer com uma mensagem.
 *
 * Devolve a ação; quem grava e envia é o webhook. Assim esta função é pura o
 * suficiente para os testes cobrirem a conversa inteira, turno a turno, sem
 * banco, sem rede e sem modelo.
 */
export async function decidir(
  leitura: Leitura,
  estado: EstadoConversa,
  fontes: Fontes,
): Promise<Acao> {
  const { intencao } = leitura;

  // 0. O modelo não respondeu — fora do ar, tempo estourado, formato quebrado.
  //
  // Vai para gente igual, mas com o motivo CERTO. Antes caía no `outro` genérico
  // e a fila dizia "assunto fora do que o robô atende": diagnóstico errado, e
  // errado do jeito pior — a operadora procura o problema na fala do devedor
  // enquanto o modelo está morto e ninguém percebe. Aconteceu de verdade, com a
  // sessão do Colab caindo no meio do dia.
  //
  // O devedor lê a mesma coisa de sempre: para ele não muda nada, e não é da
  // conta dele que a nossa infraestrutura caiu.
  if (!leitura.respondeu) {
    return {
      tipo: "escalar",
      motivo: "o robô está fora do ar (o modelo não respondeu)",
      aviso: RESPOSTAS.chamandoGente(),
    };
  }

  // 1. O que nunca é do robô, independentemente de estado.
  if (exigeGente(intencao)) {
    return { tipo: "escalar", motivo: motivoDe(intencao), aviso: RESPOSTAS.chamandoGente() };
  }

  // 2. Identificação: junta o que veio agora com o que já estava pendente.
  const documento = leitura.documento ?? estado.documentoPendente;

  // O nome só conta quando o robô ESTÁ ESPERANDO um — e isto é a diferença mais
  // importante entre o segundo fator de antes e o de agora.
  //
  // Data de nascimento se reconhece sozinha: "12/04/1985" só pode ser uma data.
  // Nome não tem forma nenhuma. Qualquer frase com duas palavras parece nome, e
  // sem esta trava "bom dia, tudo bem?" era lido como identificação — o robô
  // respondia "recebi o nome, agora me envie seu CPF" a quem só cumprimentou.
  // (Foi assim que o teste do modo direto pegou: a saudação parou de sair.)
  //
  // Quem decide que aquilo é um nome passa a ser o CONTEXTO: ou o robô acabou de
  // pedir (há documento pendente), ou o documento veio na mesma mensagem, ou o
  // classificador disse que a pessoa está se identificando.
  const esperandoNome =
    estado.documentoPendente !== null ||
    leitura.documento !== null ||
    intencao === "identificar";
  const nome = (esperandoNome ? leitura.nome : null) ?? estado.nomePendente;

  if (!ESTA_IDENTIFICADA(estado) && (documento || nome)) {
    if (documento && nome) {
      const r = await fontes.identificar(documento, nome);
      if (r.erro) {
        // Rede, VPN caída, CRM fora do ar. Acontece de verdade: rodando o app
        // fora da rede do escritório, o endereço do Siscobra é inalcançável.
        return {
          tipo: "escalar",
          motivo: "o cadastro não pôde ser consultado agora",
          aviso: RESPOSTAS.sistemaIndisponivel(),
        };
      }
      if (r.achou.length === 0) {
        // Não distingue "documento não existe" de "nome não confere", e é de
        // propósito: dizer qual dos dois falhou entregaria, a quem só tem uma
        // lista de CPFs, a informação de que aquele CPF é de devedor nosso.
        return { tipo: "escalar", motivo: "cadastro não localizado com documento e nome", aviso: RESPOSTAS.naoEncontrado() };
      }
      if (r.achou.length > 1) {
        // Carteiras diferentes: escolher uma seria falar do contrato errado.
        return { tipo: "escalar", motivo: `devedor com ${r.achou.length} carteiras`, aviso: RESPOSTAS.varios(r.achou.length) };
      }
      const d = r.achou[0];
      return {
        tipo: "responder",
        texto: RESPOSTAS.saldo({
          nome: d.primeiroNome,
          saldo: d.saldo,
          vencidoDesde: d.vencidoDesde,
        }),
        estado: {
          devcod: d.devcod,
          carcod: d.carcod,
          identificadaEm: new Date(),
          nome: d.primeiroNome,
          saldo: d.saldo,
          vencidoDesde: d.vencidoDesde,
          documentoPendente: null,
          nomePendente: null,
        },
      };
    }

    // Só metade chegou: guarda e pede o resto. É o turno a mais que antes não
    // existia — e é o que faz a identificação caber numa conversa em vez de num
    // formulário.
    return {
      tipo: "responder",
      texto: documento ? RESPOSTAS.faltaNome() : RESPOSTAS.faltaDocumento(),
      estado: { documentoPendente: documento, nomePendente: nome },
    };
  }

  // 3. Assuntos que exigem identificação. Sem ela, o robô pede — não escala:
  //    escalar aqui jogaria para a operadora um trabalho que é de formulário.
  const precisaIdentidade: Intencao[] = [
    "consultar_saldo",
    "quer_negociar",
    "quer_boleto",
    "aceita",
    "recusa",
  ];
  if (precisaIdentidade.includes(intencao) && !ESTA_IDENTIFICADA(estado)) {
    return { tipo: "responder", texto: RESPOSTAS.pedirIdentificacao() };
  }

  // 4. Identificado: informar e negociar.
  switch (intencao) {
    case "saudacao": {
      // Cumprimento repetido NÃO pode devolver a mesma frase. Foi o defeito que
      // o primeiro atendimento de verdade mostrou: "olá" e "boa tarde" seguidos
      // receberam resposta idêntica, palavra por palavra, e a conversa virou
      // eco — que é a forma mais rápida de alguém perceber que fala com um robô
      // e desistir.
      if (estado.saudacoes === 0) {
        return {
          tipo: "responder",
          texto: RESPOSTAS.saudacao(estado.nome),
          estado: { saudacoes: 1 },
        };
      }
      if (estado.saudacoes === 1) {
        return {
          tipo: "responder",
          texto: RESPOSTAS.saudacaoDeNovo(estado.nome),
          estado: { saudacoes: 2 },
        };
      }
      // Terceiro cumprimento sem dizer o que quer: inventar uma terceira frase
      // seria o mesmo defeito com outra roupa. Quem só cumprimenta três vezes
      // está esperando uma pessoa.
      return {
        tipo: "escalar",
        motivo: "só cumprimentos, sem pedido",
        aviso: RESPOSTAS.chamandoGente(),
      };
    }

    case "sobre_empresa":
      return { tipo: "responder", texto: RESPOSTAS.sobreEmpresa() };

    case "despedida":
      return { tipo: "responder", texto: RESPOSTAS.despedida() };

    case "consultar_saldo":
      return {
        tipo: "responder",
        texto: RESPOSTAS.saldo({
          nome: estado.nome,
          saldo: estado.saldo ?? 0,
          vencidoDesde: estado.vencidoDesde,
        }),
      };

    case "quer_boleto":
      // Gerar boleto é escrita no CRM: não é do robô.
      return { tipo: "escalar", motivo: "pediu boleto/2ª via", aviso: RESPOSTAS.boleto() };

    case "quer_negociar":
      return negociar(leitura, estado, fontes);

    case "aceita":
      if (!estado.oferta) {
        // "Pode ser" sem nada oferecido: concordou com o quê? Perguntar é
        // melhor que supor, e supor aqui viraria acordo que ninguém combinou.
        return {
          tipo: "escalar",
          motivo: "concordou sem proposta na mesa",
          aviso: RESPOSTAS.confirmarComGente(),
        };
      }
      return { tipo: "escalar", motivo: "aceitou a proposta", aviso: RESPOSTAS.aceitou() };

    case "recusa":
      return { tipo: "escalar", motivo: "recusou a proposta", aviso: RESPOSTAS.recusou() };

    case "identificar":
      // Disse que ia se identificar mas não mandou nada aproveitável.
      return ESTA_IDENTIFICADA(estado)
        ? { tipo: "responder", texto: RESPOSTAS.saldo({ nome: estado.nome, saldo: estado.saldo ?? 0, vencidoDesde: estado.vencidoDesde }) }
        : { tipo: "responder", texto: RESPOSTAS.pedirIdentificacao() };

    default:
      return {
        tipo: "escalar",
        motivo: "assunto fora do que o robô atende",
        aviso: RESPOSTAS.naoSeiTratar(),
      };
  }
}

async function negociar(
  leitura: Leitura,
  estado: EstadoConversa,
  fontes: Fontes,
): Promise<Acao> {
  const saldo = estado.saldo ?? 0;
  if (!(saldo > 0) || estado.carcod === null) {
    // Sem dizer que não há saldo: o robô sabe pouco demais para afirmar isso a
    // alguém, e "você não deve nada" é a frase mais cara que ele poderia soltar.
    return {
      tipo: "escalar",
      motivo: "sem saldo em aberto para negociar",
      aviso: RESPOSTAS.chamandoGente(),
    };
  }

  const regra = await fontes.regraDaCarteira(estado.carcod);
  if (!regra) {
    // A maioria das carteiras não tem regra ativa. Sem documento oficial, o
    // robô não inventa condição — e este é o caso em que inventar criaria
    // obrigação da empresa perante o devedor.
    return { tipo: "escalar", motivo: "carteira sem regra de acordo ativa", aviso: RESPOSTAS.semRegra() };
  }

  const oferta = montarOferta(saldo, regra, leitura.parcelas);
  if (!oferta) {
    return { tipo: "escalar", motivo: "a regra da carteira não comporta uma oferta", aviso: RESPOSTAS.semRegra() };
  }

  // Cinto e suspensório: a oferta que o código montou é conferida contra a
  // mesma função que julga proposta de gente. Se um dia `montarOferta` tiver um
  // defeito de arredondamento, ele para aqui e vira escalonamento — nunca uma
  // condição fora da regra dita ao devedor.
  const cabe = propostaCabeNaRegra(
    {
      parcelas: oferta.parcelas,
      valorParcela: oferta.valorParcela,
      descontoPercentual: oferta.descontoPercentual,
    },
    regra,
  );
  if (!cabe.permitido) {
    return {
      tipo: "escalar",
      motivo: `oferta calculada não coube na regra: ${cabe.motivo}`,
      aviso: RESPOSTAS.foraDaRegra(regra.maxParcelas),
    };
  }

  // Pediu mais parcelas do que a carteira permite: diz o teto e passa adiante.
  const pediuDemais =
    leitura.parcelas !== null &&
    regra.maxParcelas !== null &&
    leitura.parcelas > regra.maxParcelas;
  if (pediuDemais) {
    return {
      tipo: "escalar",
      motivo: `pediu ${leitura.parcelas}x, acima do teto de ${regra.maxParcelas}x`,
      aviso: RESPOSTAS.foraDaRegra(regra.maxParcelas),
    };
  }

  return {
    tipo: "responder",
    texto: RESPOSTAS.oferta({ saldo, ...oferta }),
    estado: { oferta: { ...oferta, em: new Date().toISOString() } },
  };
}

function motivoDe(i: Intencao): string {
  switch (i) {
    case "ja_pagou":
      return "diz que já pagou";
    case "contesta":
      return "contesta a cobrança";
    case "juridico":
      return "menção jurídica";
    default:
      return "assunto fora do que o robô atende";
  }
}
