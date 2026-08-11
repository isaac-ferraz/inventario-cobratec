// Importação de CSV — o mapa entre a planilha do TI e as entidades do sistema.
//
// PRINCÍPIO: aqui não existe validação nova. Cada entidade monta um objeto e
// entrega ao MESMO schema zod que a tela usa (lib/validations.ts), então data
// inexistente, "1.234,56", teto de estoque, e-mail e limite de texto já vêm
// resolvidos — e uma regra nova na tela vale na importação no mesmo commit.
//
// O que é responsabilidade deste arquivo:
//  1. dizer quais colunas existem (e quais sinônimos o TI pode ter digitado);
//  2. converter o texto da célula para o formato que o schema espera (sim/não →
//     booleano, 06/08/2026 → 2026-08-06, "Administrador" → ADMIN);
//  3. resolver RELAÇÃO POR NOME: a planilha diz "Ana Souza" e "Sala 93", não
//     cuid — resolver id é o passo que mais dá erro de importação, então cada
//     falha vira mensagem dizendo a linha e o nome que não casou.
//
// CÉLULA VAZIA NÃO ALTERA NADA. Numa planilha, campo em branco quase sempre
// significa "não sei", não "apague o que está lá" — então ela é omitida do
// objeto. Limpar um campo continua sendo trabalho da tela.
import type { ZodType, ZodTypeDef } from "zod";
import {
  celularSchema,
  computadorSchema,
  funcionarioSchema,
  itemDepositoSchema,
  salaSchema,
  tipoComponenteSchema,
  usuarioSchema,
} from "@/lib/validations";
import { gerarCsv, normalizarCabecalho, semAcentos } from "@/lib/csv";

export const ENTIDADES = [
  "funcionarios",
  "computadores",
  "celulares",
  "deposito",
  "tipos",
  "salas",
  "usuarios",
] as const;

export type Entidade = (typeof ENTIDADES)[number];

export function ehEntidade(v: unknown): v is Entidade {
  return typeof v === "string" && (ENTIDADES as readonly string[]).includes(v);
}

/** Erro de uma linha específica — vira mensagem na prévia, não exceção geral. */
export class ErroDeLinha extends Error {}

export type Celulas = Record<string, string>;

/** Um nome que aparece mais de uma vez não pode ser resolvido sem adivinhação. */
export type Alvo = { id: string; nome: string };
export type Indice = Map<string, Alvo | "ambiguo">;

export type Contexto = {
  funcionarios: Indice;
  salas: Indice;
};

export type Coluna = {
  /** Nome canônico normalizado (é a chave que `lerCsv` devolve). */
  chave: string;
  /** Como o modelo escreve a coluna. */
  titulo: string;
  /** Outros títulos aceitos (serão normalizados). */
  aliases?: string[];
  obrigatoria?: boolean;
  exemplo: string;
};

export type Definicao = {
  rotulo: string;
  /** Campo que identifica a linha para o TI (e para casar no modo atualizar). */
  chaveNatural: string;
  /** true quando o banco garante unicidade — só aí o "atualizar" é seguro. */
  unicaNoBanco: boolean;
  colunas: Coluna[];
  precisaFuncionarios: boolean;
  precisaSalas: boolean;
  schema: ZodType<unknown, ZodTypeDef, unknown>;
  montar: (c: Celulas, ctx: Contexto) => Record<string, unknown>;
};

// ───────────────────────────── conversões ─────────────────────────────

/** Vazio → undefined (não altera). Qualquer outra coisa → o próprio texto. */
function texto(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t === "" ? undefined : t;
}

const SIM = new Set(["sim", "s", "true", "verdadeiro", "1", "x", "ok"]);
const NAO = new Set(["nao", "n", "false", "falso", "0", "-"]);

/**
 * Aceita o que o TI escreve numa planilha de verdade: Sim/Não, S/N, x, 1/0.
 * Valor que não é nenhum dos dois vira erro de linha — silenciar viraria "não",
 * e "sem headset" gravado por engano é dado errado no inventário.
 */
export function booleano(v: string | undefined, coluna: string): boolean | undefined {
  // semAcentos e não toLowerCase(): "Não" precisa casar com "nao", e a planilha
  // brasileira escreve com acento.
  const t = semAcentos((v ?? "").trim());
  if (t === "") return undefined;
  if (SIM.has(t)) return true;
  if (NAO.has(t)) return false;
  throw new ErroDeLinha(
    `Coluna "${coluna}": "${v}" não é sim/não (aceita Sim, Não, S, N, 1, 0, x)`,
  );
}

/**
 * Data do jeito que o Brasil digita → ISO, que é o que o schema espera.
 * O que não casar com nenhum dos dois formatos passa adiante de propósito: quem
 * reclama é o schema, com a mensagem que a tela também mostraria.
 */
export function dataIso(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  if (t === "") return undefined;
  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) {
    const [, d, m, a] = br;
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return t;
}

/** "Manutenção" → "manutencao"; o schema recusa o que não for da lista. */
export function chaveSimples(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t === "" ? undefined : normalizarCabecalho(t);
}

// CUIDADO com "operadora": no vocabulário da Cobratec ela é a operadora de
// COBRANÇA, mas nesta tabela o termo já significava OPERADOR (o feminino de
// "operador do helpdesk") desde antes do papel de cobrança existir. Remapear
// agora reinterpretaria em silêncio as planilhas já usadas pelo TI — quem
// escreveu "Operadora" ontem queria abrir chamado, não atender devedor. Então
// "operadora" fica onde está, e a cobrança tem termos só dela, explícitos.
const PAPEIS_ACEITOS: Record<string, string> = {
  admin: "ADMIN",
  administrador: "ADMIN",
  administradora: "ADMIN",
  ti: "ADMIN",
  supervisor: "SUPERVISOR",
  supervisora: "SUPERVISOR",
  supervisordesala: "SUPERVISOR",
  cobranca: "COBRANCA",
  operadordecobranca: "COBRANCA",
  operadoradecobranca: "COBRANCA",
  operador: "OPERADOR",
  operadora: "OPERADOR",
  usuario: "OPERADOR",
};

/** Papel em português vira o enum; desconhecido passa para o schema reclamar. */
export function papel(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  if (t === "") return undefined;
  return PAPEIS_ACEITOS[normalizarCabecalho(t)] ?? t;
}

/** Lista dentro de uma célula: "Sala 93|Administrativo". */
export function lista(v: string | undefined): string[] | undefined {
  const t = (v ?? "").trim();
  if (t === "") return undefined;
  return t
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

// ─────────────────────────── relação por nome ───────────────────────────

export function indexar(itens: Alvo[]): Indice {
  const mapa: Indice = new Map();
  for (const item of itens) {
    const chave = normalizarCabecalho(item.nome);
    mapa.set(chave, mapa.has(chave) ? "ambiguo" : item);
  }
  return mapa;
}

function resolver(
  indice: Indice,
  valor: string | undefined,
  oQue: string,
): string | undefined {
  const nome = texto(valor);
  if (nome === undefined) return undefined;
  const achado = indice.get(normalizarCabecalho(nome));
  if (!achado) {
    throw new ErroDeLinha(
      `${oQue} "${nome}" não existe no sistema — cadastre antes ou corrija o nome`,
    );
  }
  if (achado === "ambiguo") {
    throw new ErroDeLinha(
      `Há mais de um ${oQue.toLowerCase()} chamado "${nome}" — deixe a célula em branco e ajuste na tela`,
    );
  }
  return achado.id;
}

/** Junta os campos de ciclo de vida, iguais para computador e celular. */
function cicloDeVida(c: Celulas): Record<string, unknown> {
  return {
    situacao: chaveSimples(c.situacao),
    dataAquisicao: dataIso(c.dataaquisicao),
    notaFiscal: texto(c.notafiscal),
    garantiaAte: dataIso(c.garantiaate),
    valorCompra: texto(c.valorcompra),
  };
}

const COLUNAS_CICLO: Coluna[] = [
  {
    chave: "situacao",
    titulo: "situacao",
    aliases: ["situação", "estado"],
    exemplo: "ativo",
  },
  {
    chave: "dataaquisicao",
    titulo: "data aquisicao",
    aliases: ["data de aquisição", "aquisicao", "compra"],
    exemplo: "06/08/2026",
  },
  { chave: "notafiscal", titulo: "nota fiscal", aliases: ["nf"], exemplo: "NF-1234" },
  {
    chave: "garantiaate",
    titulo: "garantia ate",
    aliases: ["garantia", "garantia até"],
    exemplo: "06/08/2028",
  },
  {
    chave: "valorcompra",
    titulo: "valor compra",
    aliases: ["valor", "preço", "preco"],
    exemplo: "3.450,90",
  },
];

const OBS: Coluna = {
  chave: "observacoes",
  titulo: "observacoes",
  aliases: ["observações", "obs"],
  exemplo: "",
};

// ─────────────────────────── as sete entidades ───────────────────────────

export const DEFINICOES: Record<Entidade, Definicao> = {
  funcionarios: {
    rotulo: "Funcionários",
    chaveNatural: "nome",
    unicaNoBanco: false,
    precisaFuncionarios: false,
    precisaSalas: true,
    schema: funcionarioSchema,
    colunas: [
      { chave: "nome", titulo: "nome", obrigatoria: true, exemplo: "Ana Souza" },
      { chave: "cargo", titulo: "cargo", obrigatoria: true, exemplo: "Operadora" },
      { chave: "sala", titulo: "sala", exemplo: "Sala 93 — piso superior" },
      {
        chave: "loginsiscobra",
        titulo: "login siscobra",
        aliases: ["siscobra"],
        exemplo: "ana.souza",
      },
      { chave: "senhasiscobra", titulo: "senha siscobra", exemplo: "" },
      {
        chave: "loginvonix",
        titulo: "login vonix",
        aliases: ["vonix"],
        exemplo: "ana.souza",
      },
      { chave: "senhavonix", titulo: "senha vonix", exemplo: "" },
      { chave: "ativo", titulo: "ativo", exemplo: "Sim" },
    ],
    montar: (c, ctx) => ({
      nome: texto(c.nome),
      cargo: texto(c.cargo),
      salaId: resolver(ctx.salas, c.sala, "Sala"),
      loginSiscobra: texto(c.loginsiscobra),
      senhaSiscobra: texto(c.senhasiscobra),
      loginVonix: texto(c.loginvonix),
      senhaVonix: texto(c.senhavonix),
      ativo: booleano(c.ativo, "ativo"),
    }),
  },

  computadores: {
    rotulo: "Computadores",
    chaveNatural: "identificador",
    unicaNoBanco: true,
    precisaFuncionarios: true,
    precisaSalas: true,
    schema: computadorSchema,
    colunas: [
      {
        chave: "identificador",
        titulo: "identificador",
        aliases: ["patrimonio", "patrimônio", "hostname", "etiqueta"],
        obrigatoria: true,
        exemplo: "PAT-1001",
      },
      {
        chave: "apelido",
        titulo: "apelido",
        aliases: ["modelo", "descricao"],
        exemplo: "PC Atendimento 01",
      },
      {
        chave: "funcionario",
        titulo: "funcionario",
        aliases: ["funcionário", "dono", "responsavel", "usuario"],
        exemplo: "Ana Souza",
      },
      { chave: "sala", titulo: "sala", exemplo: "Sala 93 — piso superior" },
      {
        chave: "loginpadrao",
        titulo: "login padrao",
        aliases: ["login", "login da maquina"],
        exemplo: "COB-1001",
      },
      { chave: "senha", titulo: "senha", exemplo: "" },
      {
        chave: "licencawindows",
        titulo: "licenca windows",
        aliases: ["windows", "licença windows"],
        exemplo: "Windows 11",
      },
      {
        chave: "licencamicrosoft",
        titulo: "licenca microsoft",
        aliases: ["microsoft", "office", "licença microsoft", "microsoft 365"],
        exemplo: "LTSC Profissional 2024",
      },
      {
        chave: "contaoutlook",
        titulo: "conta outlook",
        aliases: ["outlook", "email", "e-mail"],
        exemplo: "ana.souza@cobratecsp.com.br",
      },
      { chave: "temmouse", titulo: "mouse", aliases: ["tem mouse"], exemplo: "Sim" },
      {
        chave: "temteclado",
        titulo: "teclado",
        aliases: ["tem teclado"],
        exemplo: "Sim",
      },
      {
        chave: "temheadset",
        titulo: "headset",
        aliases: ["tem headset", "fone"],
        exemplo: "Nao",
      },
      OBS,
      ...COLUNAS_CICLO,
    ],
    montar: (c, ctx) => ({
      identificador: texto(c.identificador),
      apelido: texto(c.apelido),
      funcionarioId: resolver(ctx.funcionarios, c.funcionario, "Funcionário"),
      salaId: resolver(ctx.salas, c.sala, "Sala"),
      loginPadrao: texto(c.loginpadrao),
      senha: texto(c.senha),
      licencaWindows: texto(c.licencawindows),
      licencaMicrosoft: texto(c.licencamicrosoft),
      contaOutlook: texto(c.contaoutlook),
      temMouse: booleano(c.temmouse, "mouse"),
      temTeclado: booleano(c.temteclado, "teclado"),
      temHeadset: booleano(c.temheadset, "headset"),
      observacoes: texto(c.observacoes),
      ...cicloDeVida(c),
    }),
  },

  celulares: {
    rotulo: "Celulares",
    chaveNatural: "identificador",
    unicaNoBanco: true,
    precisaFuncionarios: true,
    precisaSalas: false,
    schema: celularSchema,
    colunas: [
      {
        chave: "identificador",
        titulo: "identificador",
        aliases: ["patrimonio", "patrimônio", "etiqueta"],
        obrigatoria: true,
        exemplo: "CEL-001",
      },
      {
        chave: "apelido",
        titulo: "apelido",
        aliases: ["modelo"],
        exemplo: "Moto G54",
      },
      {
        chave: "numero",
        titulo: "numero",
        aliases: ["número", "linha", "telefone"],
        exemplo: "(12) 99999-0000",
      },
      { chave: "operadora", titulo: "operadora", exemplo: "Vivo" },
      { chave: "imei", titulo: "imei", exemplo: "356938035643809" },
      {
        chave: "funcionario",
        titulo: "funcionario",
        aliases: ["funcionário", "dono", "responsavel"],
        exemplo: "Ana Souza",
      },
      OBS,
      ...COLUNAS_CICLO,
    ],
    montar: (c, ctx) => ({
      identificador: texto(c.identificador),
      apelido: texto(c.apelido),
      numero: texto(c.numero),
      operadora: texto(c.operadora),
      imei: texto(c.imei),
      funcionarioId: resolver(ctx.funcionarios, c.funcionario, "Funcionário"),
      observacoes: texto(c.observacoes),
      ...cicloDeVida(c),
    }),
  },

  deposito: {
    rotulo: "Depósito",
    chaveNatural: "nome",
    unicaNoBanco: false,
    precisaFuncionarios: false,
    precisaSalas: false,
    schema: itemDepositoSchema,
    colunas: [
      {
        chave: "nome",
        titulo: "nome",
        aliases: ["item", "descricao"],
        obrigatoria: true,
        exemplo: "Cabo HDMI 2m",
      },
      { chave: "categoria", titulo: "categoria", aliases: ["tipo"], exemplo: "Cabos" },
      {
        chave: "quantidade",
        titulo: "quantidade",
        aliases: ["qtd", "qtde"],
        exemplo: "12",
      },
      {
        chave: "quantidademinima",
        titulo: "quantidade minima",
        aliases: ["minimo", "mínimo", "estoque minimo", "qtd minima"],
        exemplo: "5",
      },
      {
        chave: "localizacao",
        titulo: "localizacao",
        aliases: ["localização", "caixa", "local", "prateleira"],
        exemplo: "Caixa 3",
      },
      OBS,
    ],
    montar: (c) => ({
      nome: texto(c.nome),
      categoria: texto(c.categoria),
      quantidade: texto(c.quantidade),
      quantidadeMinima: texto(c.quantidademinima),
      localizacao: texto(c.localizacao),
      observacoes: texto(c.observacoes),
    }),
  },

  tipos: {
    rotulo: "Tipos de componente",
    chaveNatural: "nome",
    unicaNoBanco: true,
    precisaFuncionarios: false,
    precisaSalas: false,
    schema: tipoComponenteSchema,
    colunas: [
      {
        chave: "nome",
        titulo: "nome",
        aliases: ["tipo", "componente"],
        obrigatoria: true,
        exemplo: "Memória RAM",
      },
    ],
    montar: (c) => ({ nome: texto(c.nome) }),
  },

  salas: {
    rotulo: "Salas",
    chaveNatural: "nome",
    unicaNoBanco: true,
    precisaFuncionarios: false,
    precisaSalas: false,
    schema: salaSchema,
    colunas: [
      {
        chave: "nome",
        titulo: "nome",
        obrigatoria: true,
        exemplo: "Sala 93 — piso superior",
      },
      { chave: "predio", titulo: "predio", aliases: ["prédio"], exemplo: "Prédio 93" },
      { chave: "piso", titulo: "piso", aliases: ["andar"], exemplo: "superior" },
      { chave: "ordem", titulo: "ordem", exemplo: "1" },
      { chave: "ativa", titulo: "ativa", exemplo: "Sim" },
      OBS,
    ],
    montar: (c) => ({
      nome: texto(c.nome),
      predio: texto(c.predio),
      piso: texto(c.piso),
      ordem: texto(c.ordem),
      ativa: booleano(c.ativa, "ativa"),
      observacoes: texto(c.observacoes),
    }),
  },

  usuarios: {
    rotulo: "Usuários",
    chaveNatural: "login",
    unicaNoBanco: true,
    precisaFuncionarios: true,
    precisaSalas: true,
    schema: usuarioSchema,
    colunas: [
      { chave: "login", titulo: "login", obrigatoria: true, exemplo: "ana.souza" },
      { chave: "nome", titulo: "nome", obrigatoria: true, exemplo: "Ana Souza" },
      {
        chave: "papel",
        titulo: "papel",
        aliases: ["perfil", "acesso"],
        obrigatoria: true,
        exemplo: "Operador",
      },
      {
        chave: "senha",
        titulo: "senha",
        aliases: ["senha inicial"],
        exemplo: "(em branco = sorteada)",
      },
      { chave: "ativo", titulo: "ativo", exemplo: "Sim" },
      {
        chave: "funcionario",
        titulo: "funcionario",
        aliases: ["funcionário", "pessoa"],
        exemplo: "Ana Souza",
      },
      {
        chave: "salas",
        titulo: "salas",
        aliases: ["sala", "salas supervisionadas"],
        exemplo: "Sala 93 — piso superior|Administrativo 83",
      },
      {
        chave: "siscobrausucod",
        titulo: "codigo siscobra",
        aliases: ["código siscobra", "codigo do siscobra", "usucod", "cod siscobra"],
        exemplo: "1042",
      },
    ],
    montar: (c, ctx) => {
      const papelFinal = papel(c.papel);
      const nomes = lista(c.salas);
      // Sala só faz sentido para supervisor, e código do Siscobra só para
      // cobrança; mandar qualquer um dos dois para o papel errado é engano de
      // planilha, e é melhor avisar do que ignorar calado.
      if (nomes && papelFinal !== "SUPERVISOR") {
        throw new ErroDeLinha(
          "Coluna \"salas\" só vale para papel Supervisor — deixe em branco para os demais",
        );
      }
      const usucod = texto(c.siscobrausucod);
      if (usucod && papelFinal !== "COBRANCA") {
        throw new ErroDeLinha(
          "Coluna \"codigo siscobra\" só vale para papel Cobrança — deixe em branco para os demais",
        );
      }
      return {
        login: texto(c.login),
        nome: texto(c.nome),
        papel: papelFinal,
        senha: texto(c.senha),
        ativo: booleano(c.ativo, "ativo"),
        funcionarioId: resolver(ctx.funcionarios, c.funcionario, "Funcionário"),
        salaIds: nomes?.map((n) => resolver(ctx.salas, n, "Sala")!),
        // Texto cru: quem converte e reclama é o schema (que agora coage),
        // com a mesma mensagem que a tela mostraria.
        siscobraUsucod: usucod,
      };
    },
  },
};

// ─────────────────────────── colunas e modelo ───────────────────────────

/**
 * Mapa "cabeçalho que veio no arquivo" → "chave canônica". Permite que a
 * planilha diga "Patrimônio" onde o sistema chama `identificador`.
 */
export function mapaDeAliases(entidade: Entidade): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const col of DEFINICOES[entidade].colunas) {
    mapa.set(col.chave, col.chave);
    mapa.set(normalizarCabecalho(col.titulo), col.chave);
    for (const a of col.aliases ?? []) mapa.set(normalizarCabecalho(a), col.chave);
  }
  return mapa;
}

/** Traduz as células do arquivo para as chaves canônicas da entidade. */
export function canonizar(celulas: Celulas, entidade: Entidade): Celulas {
  const mapa = mapaDeAliases(entidade);
  const saida: Celulas = {};
  for (const [chave, valor] of Object.entries(celulas)) {
    const canonica = mapa.get(chave);
    if (canonica) saida[canonica] = valor;
  }
  return saida;
}

/** Colunas do arquivo que o sistema não conhece — avisadas, não fatais. */
export function colunasDesconhecidas(
  chaves: string[],
  entidade: Entidade,
): string[] {
  const mapa = mapaDeAliases(entidade);
  return chaves.filter((c) => c && !mapa.has(c));
}

export function colunasObrigatoriasFaltando(
  chaves: string[],
  entidade: Entidade,
): string[] {
  const mapa = mapaDeAliases(entidade);
  const presentes = new Set(
    chaves.map((c) => mapa.get(c)).filter((c): c is string => Boolean(c)),
  );
  return DEFINICOES[entidade].colunas
    .filter((c) => c.obrigatoria && !presentes.has(c.chave))
    .map((c) => c.titulo);
}

/** CSV de exemplo para o TI preencher — cabeçalho + uma linha ilustrativa. */
export function modeloCsv(entidade: Entidade): string {
  const colunas = DEFINICOES[entidade].colunas;
  return gerarCsv(
    colunas.map((c) => c.titulo),
    [colunas.map((c) => c.exemplo)],
  );
}
