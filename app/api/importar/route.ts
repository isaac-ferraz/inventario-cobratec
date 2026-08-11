import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import {
  importarSchema,
  LIMITE_CSV_LINHAS,
} from "@/lib/validations";
import { validarCorpo, erro, tratarErroPrisma } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import { registrarAuditoria, type AcaoAuditoria } from "@/lib/auditoria";
import type { Papel } from "@/lib/supervisao";
import { gerarHashSenha, gerarSenhaProvisoria } from "@/lib/senha";
import { lerCsv, normalizarCabecalho } from "@/lib/csv";
import {
  canonizar,
  colunasDesconhecidas,
  colunasObrigatoriasFaltando,
  DEFINICOES,
  ehEntidade,
  ErroDeLinha,
  indexar,
  modeloCsv,
  type Celulas,
  type Contexto,
  type Entidade,
  type Indice,
} from "@/lib/importacao";

// POST /api/importar — carga em massa por CSV. Só administrador.
//
// DUAS FASES, mesma rota: `aplicar: false` devolve a PRÉVIA (o que seria criado,
// atualizado e o que está errado, linha por linha) sem escrever nada;
// `aplicar: true` executa. A prévia existe porque importação é a operação com
// maior chance de estragar dados em silêncio — o TI precisa ver o plano antes.
//
// A fase de aplicar reprocessa o arquivo do zero em vez de confiar num plano
// guardado: a rota fica sem estado, e o que vale é o banco no instante da
// escrita, não no instante da prévia.

type Acao = "criar" | "atualizar" | "erro";

type LinhaPlano = {
  /** Linha no arquivo (2 é a primeira de dados), para achar na planilha. */
  linha: number;
  chave: string;
  acao: Acao;
  erro?: string;
};

type Item = {
  plano: LinhaPlano;
  dados: Record<string, unknown>;
  /** Preenchido quando a linha atualiza um registro existente. */
  id?: string;
  /** Só usuários: senha em texto quando ela foi sorteada aqui. */
  senhaSorteada?: string;
  senhaHash?: string;
};

const NOME_AUDITORIA: Record<Entidade, Parameters<typeof registrarAuditoria>[1]["entidade"]> = {
  funcionarios: "Funcionario",
  computadores: "Computador",
  celulares: "Celular",
  deposito: "ItemDeposito",
  tipos: "TipoComponente",
  salas: "Sala",
  usuarios: "Usuario",
};

/** Índice dos registros que já existem, pela chave natural normalizada. */
async function carregarExistentes(entidade: Entidade): Promise<Indice> {
  switch (entidade) {
    case "funcionarios":
      return indexar(
        await prisma.funcionario.findMany({ select: { id: true, nome: true } }),
      );
    case "computadores":
      return indexar(
        (
          await prisma.computador.findMany({
            select: { id: true, identificador: true },
          })
        ).map((c) => ({ id: c.id, nome: c.identificador })),
      );
    case "celulares":
      return indexar(
        (
          await prisma.celular.findMany({
            select: { id: true, identificador: true },
          })
        ).map((c) => ({ id: c.id, nome: c.identificador })),
      );
    case "deposito":
      return indexar(
        await prisma.itemDeposito.findMany({ select: { id: true, nome: true } }),
      );
    case "tipos":
      return indexar(
        await prisma.tipoComponente.findMany({ select: { id: true, nome: true } }),
      );
    case "salas":
      return indexar(await prisma.sala.findMany({ select: { id: true, nome: true } }));
    case "usuarios":
      return indexar(
        (await prisma.usuario.findMany({ select: { id: true, login: true } })).map(
          (u) => ({ id: u.id, nome: u.login }),
        ),
      );
  }
}

async function carregarContexto(entidade: Entidade): Promise<Contexto> {
  const def = DEFINICOES[entidade];
  const [funcionarios, salas] = await Promise.all([
    def.precisaFuncionarios
      ? prisma.funcionario.findMany({ select: { id: true, nome: true } })
      : Promise.resolve([]),
    def.precisaSalas
      ? prisma.sala.findMany({ select: { id: true, nome: true } })
      : Promise.resolve([]),
  ]);
  return { funcionarios: indexar(funcionarios), salas: indexar(salas) };
}

/** Mensagem curta de um ZodError: a primeira frase é a que interessa na linha. */
function mensagemZod(e: ZodError): string {
  return e.errors
    .map((x) => {
      const campo = x.path.filter((p) => typeof p === "string").join(".");
      return campo ? `${campo}: ${x.message}` : x.message;
    })
    .join("; ");
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const r = await validarCorpo(req, importarSchema);
  if ("resposta" in r) return r.resposta;

  const { csv, modo, aplicar, ignorarErros } = r.data;
  if (!ehEntidade(r.data.entidade)) {
    return erro("Não sei importar isso.", 400);
  }
  const entidade: Entidade = r.data.entidade;
  const def = DEFINICOES[entidade];

  const leitura = lerCsv(csv);
  if (leitura.registros.length === 0) {
    return erro("O arquivo não tem nenhuma linha de dados além do cabeçalho.", 400);
  }
  if (leitura.registros.length > LIMITE_CSV_LINHAS) {
    return erro(
      `São ${leitura.registros.length} linhas e o limite é ${LIMITE_CSV_LINHAS} por importação. Quebre a planilha em partes.`,
      400,
    );
  }

  const faltando = colunasObrigatoriasFaltando(leitura.chaves, entidade);
  if (faltando.length > 0) {
    return erro(
      `Falta(m) a(s) coluna(s) obrigatória(s): ${faltando.join(", ")}. Baixe o modelo para ver o cabeçalho esperado.`,
      400,
    );
  }

  try {
    const [existentes, contexto] = await Promise.all([
      carregarExistentes(entidade),
      carregarContexto(entidade),
    ]);

    const itens: Item[] = [];
    // Chave repetida DENTRO do arquivo: sem isto a segunda linha sobrescreveria
    // a primeira em silêncio (ou estouraria o unique no meio da transação).
    const vistas = new Map<string, number>();

    for (const registro of leitura.registros) {
      const celulas: Celulas = canonizar(registro.celulas, entidade);
      const bruto = (celulas[def.chaveNatural] ?? "").trim();
      const chaveLegivel = bruto || "(sem " + def.chaveNatural + ")";
      const plano: LinhaPlano = { linha: registro.linha, chave: chaveLegivel, acao: "erro" };

      const falhar = (msg: string) => {
        plano.erro = msg;
        itens.push({ plano, dados: {} });
      };

      if (!bruto) {
        falhar(`A coluna "${def.chaveNatural}" está vazia`);
        continue;
      }

      // Mesma normalização do cabeçalho: "PAT-1001" e "pat 1001" são a mesma
      // máquina para efeito de casar com o que já existe.
      const chaveNorm = normalizarCabecalho(bruto);

      const linhaAnterior = vistas.get(chaveNorm);
      if (linhaAnterior !== undefined) {
        falhar(`"${bruto}" aparece duas vezes no arquivo (veja a linha ${linhaAnterior})`);
        continue;
      }
      vistas.set(chaveNorm, registro.linha);

      // 1) planilha → objeto (relações por nome resolvidas aqui)
      let objeto: Record<string, unknown>;
      try {
        objeto = def.montar(celulas, contexto);
      } catch (e) {
        falhar(e instanceof ErroDeLinha ? e.message : "Linha inválida");
        continue;
      }

      // 2) o MESMO schema da tela valida
      let dados: Record<string, unknown>;
      try {
        dados = def.schema.parse(objeto) as Record<string, unknown>;
      } catch (e) {
        falhar(e instanceof ZodError ? mensagemZod(e) : "Dados inválidos");
        continue;
      }

      // 3) criar ou atualizar?
      const achado = existentes.get(chaveNorm);
      if (achado === "ambiguo") {
        falhar(
          `Já existe mais de um registro chamado "${bruto}" — resolva na tela antes de importar`,
        );
        continue;
      }
      if (achado && modo === "criar") {
        falhar(
          `"${bruto}" já existe. Use o modo "criar e atualizar" para atualizar o que já está cadastrado.`,
        );
        continue;
      }
      if (achado && !def.unicaNoBanco) {
        // Sem unique no banco, casar por nome é palpite — mas com exatamente um
        // registro de mesmo nome o palpite é seguro, e é o que o TI espera ao
        // reimportar a planilha corrigida.
        plano.acao = "atualizar";
        itens.push({ plano, dados, id: achado.id });
        continue;
      }
      plano.acao = achado ? "atualizar" : "criar";
      itens.push({ plano, dados, id: achado?.id });
    }

    // Trava específica de usuários: a importação não pode ser porta dos fundos
    // para o que a tela impede (decisão 25.3).
    if (entidade === "usuarios") {
      for (const item of itens) {
        if (item.plano.acao === "erro") continue;
        const dados = item.dados as { login?: string; papel?: string; ativo?: boolean };
        if (dados.login === auth.usuario.login) {
          item.plano.acao = "erro";
          item.plano.erro =
            "É a sua própria conta — mexa nela na tela de usuários, não por importação";
        }
      }
      // Não existe checagem de "ficaria sem administrador" aqui de propósito:
      // quem importa é, por definição, um admin ativo (exigirAdmin), a linha da
      // própria conta acabou de ser recusada e a importação nunca remove
      // ninguém — então sempre sobra pelo menos um. Uma trava a mais aqui seria
      // código que nenhum teste consegue exercitar.
    }

    const erros = itens.filter((i) => i.plano.acao === "erro");
    const aplicaveis = itens.filter((i) => i.plano.acao !== "erro");

    const resumo = {
      entidade,
      rotulo: def.rotulo,
      modo,
      delimitador: leitura.delimitador,
      colunasIgnoradas: colunasDesconhecidas(leitura.chaves, entidade),
      totais: {
        linhas: itens.length,
        criar: itens.filter((i) => i.plano.acao === "criar").length,
        atualizar: itens.filter((i) => i.plano.acao === "atualizar").length,
        erros: erros.length,
      },
      linhas: itens.map((i) => i.plano),
    };

    // ─── prévia ───
    if (!aplicar) {
      return NextResponse.json({ ...resumo, aplicado: false });
    }

    if (erros.length > 0 && !ignorarErros) {
      return NextResponse.json(
        {
          ...resumo,
          aplicado: false,
          erro: `${erros.length} linha(s) com problema. Corrija a planilha ou marque "importar só as linhas válidas".`,
        },
        { status: 400 },
      );
    }
    if (aplicaveis.length === 0) {
      return NextResponse.json(
        { ...resumo, aplicado: false, erro: "Nenhuma linha válida para importar." },
        { status: 400 },
      );
    }

    // Hash de senha ANTES da transação: scrypt é caro de propósito e prender a
    // transação do SQLite durante N hashes travaria o resto do app.
    if (entidade === "usuarios") {
      for (const item of aplicaveis) {
        const dados = item.dados as { senha?: string };
        if (dados.senha) {
          item.senhaHash = await gerarHashSenha(dados.senha);
        } else if (!item.id) {
          // Criando sem senha na planilha: sorteia e devolve na resposta, que é
          // a única vez que ela aparece em texto.
          item.senhaSorteada = gerarSenhaProvisoria();
          item.senhaHash = await gerarHashSenha(item.senhaSorteada);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const item of aplicaveis) {
        await gravar(tx, entidade, item);
      }
    });

    const acao: AcaoAuditoria = resumo.totais.atualizar > 0 ? "editar" : "criar";
    await registrarAuditoria(req, {
      acao,
      entidade: NOME_AUDITORIA[entidade],
      descricao: `Importação de CSV em ${def.rotulo}: ${resumo.totais.criar} criado(s), ${resumo.totais.atualizar} atualizado(s)${
        erros.length ? `, ${erros.length} linha(s) ignorada(s)` : ""
      }`,
    });

    const senhas = aplicaveis
      .filter((i) => i.senhaSorteada)
      .map((i) => ({
        login: String((i.dados as { login?: string }).login ?? ""),
        senha: i.senhaSorteada!,
      }));

    return NextResponse.json({
      ...resumo,
      aplicado: true,
      senhasSorteadas: senhas,
    });
  } catch (e) {
    return tratarErroPrisma(e);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * A escrita, por entidade. É um switch e não uma tabela de delegates porque os
 * tipos do Prisma são diferentes em cada modelo — o switch mantém a tipagem
 * estrita (CLAUDE.md: sem `any` injustificado).
 */
async function gravar(tx: Tx, entidade: Entidade, item: Item): Promise<void> {
  const d = item.dados;

  switch (entidade) {
    case "funcionarios": {
      const dados = d as {
        nome: string;
        cargo: string;
        salaId?: string | null;
        loginSiscobra?: string | null;
        senhaSiscobra?: string | null;
        loginVonix?: string | null;
        senhaVonix?: string | null;
        ativo?: boolean;
      };
      if (item.id) await tx.funcionario.update({ where: { id: item.id }, data: dados });
      else await tx.funcionario.create({ data: dados });
      return;
    }
    case "computadores": {
      const dados = d as Parameters<typeof tx.computador.create>[0]["data"];
      if (item.id) {
        await tx.computador.update({
          where: { id: item.id },
          data: dados as Parameters<typeof tx.computador.update>[0]["data"],
        });
      } else {
        await tx.computador.create({ data: dados });
      }
      return;
    }
    case "celulares": {
      const dados = d as Parameters<typeof tx.celular.create>[0]["data"];
      if (item.id) {
        await tx.celular.update({
          where: { id: item.id },
          data: dados as Parameters<typeof tx.celular.update>[0]["data"],
        });
      } else {
        await tx.celular.create({ data: dados });
      }
      return;
    }
    case "deposito": {
      const dados = d as Parameters<typeof tx.itemDeposito.create>[0]["data"];
      if (item.id) {
        await tx.itemDeposito.update({
          where: { id: item.id },
          data: dados as Parameters<typeof tx.itemDeposito.update>[0]["data"],
        });
      } else {
        await tx.itemDeposito.create({ data: dados });
      }
      return;
    }
    case "tipos": {
      const dados = d as { nome: string };
      if (item.id)
        await tx.tipoComponente.update({ where: { id: item.id }, data: dados });
      else await tx.tipoComponente.create({ data: dados });
      return;
    }
    case "salas": {
      const dados = d as Parameters<typeof tx.sala.create>[0]["data"];
      if (item.id) {
        await tx.sala.update({
          where: { id: item.id },
          data: dados as Parameters<typeof tx.sala.update>[0]["data"],
        });
      } else {
        await tx.sala.create({ data: dados });
      }
      return;
    }
    case "usuarios": {
      const dados = d as {
        login: string;
        nome: string;
        papel: Papel;
        ativo?: boolean;
        funcionarioId?: string | null;
        salaIds?: string[];
        siscobraUsucod?: number | null;
      };
      // Supervisão: o conjunto informado substitui o atual (mesma regra do
      // PATCH da tela). Papel diferente de supervisor limpa os vínculos.
      const salas =
        dados.papel === "SUPERVISOR" ? [...new Set(dados.salaIds ?? [])] : [];
      // Código do Siscobra: mesma invariante que POST e PATCH garantem — ele só
      // existe para COBRANCA. Papel diferente ZERA (rebaixar alguém por planilha
      // não pode deixar para trás um código que a tela já teria soltado). Sendo
      // cobrança, célula em branco não apaga o que já está gravado — é a regra
      // geral da importação, e o papel obrigatório na planilha faz a decisão
      // caber sempre nestes dois casos.
      const usucod =
        dados.papel !== "COBRANCA"
          ? { siscobraUsucod: null }
          : dados.siscobraUsucod === undefined
            ? {}
            : { siscobraUsucod: dados.siscobraUsucod };
      const comum = {
        login: dados.login,
        nome: dados.nome,
        papel: dados.papel,
        ...usucod,
        ...(dados.ativo === undefined ? {} : { ativo: dados.ativo }),
        ...(dados.funcionarioId === undefined
          ? {}
          : { funcionarioId: dados.funcionarioId }),
        // Senha vinda de planilha (ou sorteada) nasce provisória: quem recebe
        // troca no primeiro acesso.
        ...(item.senhaHash
          ? { senhaHash: item.senhaHash, senhaProvisoria: true }
          : {}),
      };

      if (item.id) {
        await tx.usuario.update({
          where: { id: item.id },
          data: {
            ...comum,
            supervisoes: {
              deleteMany: {},
              create: salas.map((salaId) => ({ salaId })),
            },
          },
        });
      } else {
        await tx.usuario.create({
          data: {
            ...comum,
            senhaHash: item.senhaHash!,
            senhaProvisoria: true,
            supervisoes: { create: salas.map((salaId) => ({ salaId })) },
          },
        });
      }
      return;
    }
  }
}

// GET /api/importar?entidade=funcionarios&modelo=1 — baixa o CSV de exemplo.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const url = new URL(req.url);
  const pedida = url.searchParams.get("entidade");
  if (!ehEntidade(pedida)) return erro("Não sei importar isso.", 400);

  // O ﻿ é o BOM: sem ele o Excel abre o arquivo em ANSI e "Memória" chega
  // como "MemÃ³ria" na tela de quem for preencher o modelo.
  const csv = "\uFEFF" + modeloCsv(pedida);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="modelo-${pedida}.csv"`,
    },
  });
}
