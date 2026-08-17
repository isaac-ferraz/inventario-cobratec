// Importação de CSV pela rota — com banco de verdade.
//
// O que se protege aqui: (1) a PRÉVIA não escreve nada; (2) linha com erro não
// arrasta as boas; (3) célula vazia não apaga o que já está gravado — que é o
// jeito mais fácil de uma importação destruir um cadastro em silêncio.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as importar, GET as modelo } from "@/app/api/importar/route";
import { verificarSenha } from "@/lib/senha";
import { criarUsuario, limparBanco, ler, requisicao, type UsuarioTeste } from "./ajuda";

let admin: UsuarioTeste;

beforeEach(async () => {
  await limparBanco();
  admin = await criarUsuario("ti-import", "ADMIN");
});

type Corpo = {
  entidade: string;
  csv: string;
  modo?: "criar" | "atualizar";
  aplicar?: boolean;
  ignorarErros?: boolean;
};

async function enviar(corpo: Corpo, usuario: UsuarioTeste = admin) {
  return ler(
    await importar(
      await requisicao("POST", "/api/importar", { usuario, corpo }),
    ),
  );
}

type Plano = {
  totais: { linhas: number; criar: number; atualizar: number; erros: number };
  linhas: { linha: number; chave: string; acao: string; erro?: string }[];
  senhasSorteadas?: { login: string; senha: string }[];
  colunasIgnoradas: string[];
};

const plano = (corpo: Record<string, unknown>) => corpo as unknown as Plano;

describe("acesso", () => {
  it("operador não importa", async () => {
    const op = await criarUsuario("op", "OPERADOR");
    const { status } = await enviar(
      { entidade: "tipos", csv: "nome\nMemória" },
      op,
    );
    expect(status).toBe(403);
  });

  it("supervisor também não", async () => {
    const sup = await criarUsuario("sup", "SUPERVISOR");
    const { status } = await enviar(
      { entidade: "tipos", csv: "nome\nMemória" },
      sup,
    );
    expect(status).toBe(403);
  });
});

describe("prévia", () => {
  it("conta o que faria e NÃO escreve nada", async () => {
    const { status, corpo } = await enviar({
      entidade: "tipos",
      csv: "nome\nMemória RAM\nProcessador",
    });
    expect(status).toBe(200);
    expect(plano(corpo).totais).toMatchObject({ linhas: 2, criar: 2, erros: 0 });
    expect(await prisma.tipoComponente.count()).toBe(0);
  });

  it("avisa a coluna que vai ignorar", async () => {
    const { corpo } = await enviar({
      entidade: "tipos",
      csv: "nome;signo\nMemória;Áries",
    });
    expect(plano(corpo).colunasIgnoradas).toEqual(["signo"]);
  });
});

describe("criar", () => {
  it("grava as linhas quando aplicar", async () => {
    await enviar({
      entidade: "tipos",
      csv: "nome\nMemória RAM\nProcessador",
      aplicar: true,
    });
    const nomes = (
      await prisma.tipoComponente.findMany({ orderBy: { nome: "asc" } })
    ).map((t) => t.nome);
    expect(nomes).toEqual(["Memória RAM", "Processador"]);
  });

  it("aceita sinônimo de coluna no cabeçalho", async () => {
    await enviar({
      entidade: "tipos",
      csv: "componente\nFonte",
      aplicar: true,
    });
    expect(await prisma.tipoComponente.count()).toBe(1);
  });

  it("registra um evento de auditoria por importação, não por linha", async () => {
    await enviar({
      entidade: "tipos",
      csv: "nome\nA\nB\nC",
      aplicar: true,
    });
    const logs = await prisma.logAuditoria.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].descricao).toMatch(/3 criado/);
  });

  it("quem já existe vira erro no modo criar", async () => {
    await prisma.tipoComponente.create({ data: { nome: "Memória RAM" } });
    const { corpo } = await enviar({
      entidade: "tipos",
      csv: "nome\nMemória RAM",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/já existe/);
  });
});

describe("atualizar", () => {
  it("atualiza o que já existe", async () => {
    const sala = await prisma.sala.create({
      data: { nome: "Sala 93", predio: "antigo", ordem: 1 },
    });
    const { corpo } = await enviar({
      entidade: "salas",
      csv: "nome;predio\nSala 93;Prédio 93",
      modo: "atualizar",
      aplicar: true,
    });
    expect(plano(corpo).totais).toMatchObject({ criar: 0, atualizar: 1 });
    const depois = await prisma.sala.findUnique({ where: { id: sala.id } });
    expect(depois?.predio).toBe("Prédio 93");
    expect(await prisma.sala.count()).toBe(1);
  });

  it("CÉLULA VAZIA NÃO APAGA o que está gravado", async () => {
    const sala = await prisma.sala.create({
      data: {
        nome: "Sala 93",
        predio: "Prédio 93",
        piso: "superior",
        observacoes: "tem ar condicionado",
        ordem: 1,
      },
    });
    await enviar({
      entidade: "salas",
      csv: "nome;predio;piso;observacoes\nSala 93;Prédio 93;;",
      modo: "atualizar",
      aplicar: true,
    });
    const depois = await prisma.sala.findUnique({ where: { id: sala.id } });
    expect(depois?.piso).toBe("superior");
    expect(depois?.observacoes).toBe("tem ar condicionado");
  });

  it("casa pelo nome quando o banco não tem unique (depósito)", async () => {
    await prisma.itemDeposito.create({
      data: { nome: "Cabo HDMI", quantidade: 2 },
    });
    await enviar({
      entidade: "deposito",
      csv: "nome;quantidade\nCabo HDMI;15",
      modo: "atualizar",
      aplicar: true,
    });
    const itens = await prisma.itemDeposito.findMany();
    expect(itens).toHaveLength(1);
    expect(itens[0].quantidade).toBe(15);
  });

  it("nome ambíguo no cadastro é recusado em vez de escolher um", async () => {
    await prisma.itemDeposito.create({ data: { nome: "Cabo HDMI" } });
    await prisma.itemDeposito.create({ data: { nome: "cabo hdmi" } });
    const { corpo } = await enviar({
      entidade: "deposito",
      csv: "nome;quantidade\nCabo HDMI;15",
      modo: "atualizar",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/mais de um/);
  });
});

describe("relação por nome", () => {
  beforeEach(async () => {
    await prisma.sala.create({ data: { nome: "Sala 93", ordem: 1 } });
    await prisma.funcionario.create({ data: { nome: "Ana Souza", cargo: "Operadora" } });
  });

  it("vincula funcionário e sala pelo nome escrito na planilha", async () => {
    await enviar({
      entidade: "computadores",
      csv: "identificador;funcionario;sala\nPAT-1;Ana Souza;Sala 93",
      aplicar: true,
    });
    const pc = await prisma.computador.findUnique({
      where: { identificador: "PAT-1" },
      include: { funcionario: true, sala: true },
    });
    expect(pc?.funcionario?.nome).toBe("Ana Souza");
    expect(pc?.sala?.nome).toBe("Sala 93");
  });

  it("nome que não existe erra a linha e diz qual nome", async () => {
    const { corpo } = await enviar({
      entidade: "computadores",
      csv: "identificador;funcionario\nPAT-1;Zé Ninguém",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/Zé Ninguém/);
    expect(plano(corpo).totais.erros).toBe(1);
  });
});

describe("validação vem dos schemas da tela", () => {
  it("data brasileira é convertida e gravada ao meio-dia UTC", async () => {
    await enviar({
      entidade: "computadores",
      csv: "identificador;data aquisicao\nPAT-1;06/08/2026",
      aplicar: true,
    });
    const pc = await prisma.computador.findUnique({
      where: { identificador: "PAT-1" },
    });
    expect(pc?.dataAquisicao?.toISOString()).toBe("2026-08-06T12:00:00.000Z");
  });

  it("data que não existe no calendário erra a linha (mesma regra da tela)", async () => {
    const { corpo } = await enviar({
      entidade: "computadores",
      csv: "identificador;garantia ate\nPAT-1;31/02/2026",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/inexistente no calendário/);
  });

  it("valor no formato do TI e e-mail inválido", async () => {
    const { corpo } = await enviar({
      entidade: "computadores",
      csv: "identificador;valor compra;conta outlook\nPAT-1;3.450,90;nao-e-email\nPAT-2;1.000,00;a@b.com",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/e-mail/i);
    expect(plano(corpo).linhas[1].acao).toBe("criar");
  });

  it("quantidade acima do teto de estoque erra a linha", async () => {
    const { corpo } = await enviar({
      entidade: "deposito",
      csv: "nome;quantidade\nCabo;999999999",
    });
    expect(plano(corpo).totais.erros).toBe(1);
  });
});

describe("integridade do arquivo", () => {
  it("chave repetida no arquivo aponta a linha anterior", async () => {
    const { corpo } = await enviar({
      entidade: "tipos",
      csv: "nome\nMemória\nProcessador\nMemória",
    });
    expect(plano(corpo).linhas[2].erro).toMatch(/duas vezes.*linha 2/);
  });

  it("chave vazia erra a linha", async () => {
    const { corpo } = await enviar({ entidade: "tipos", csv: "nome\n\nProcessador" });
    const comErro = plano(corpo).linhas.filter((l) => l.acao === "erro");
    expect(comErro.length).toBeGreaterThanOrEqual(0);
  });

  it("coluna obrigatória faltando recusa o arquivo inteiro", async () => {
    const { status, corpo } = await enviar({
      entidade: "funcionarios",
      csv: "nome\nAna Souza",
    });
    expect(status).toBe(400);
    expect(String(corpo.erro)).toMatch(/cargo/);
  });

  it("arquivo só com cabeçalho é recusado", async () => {
    const { status } = await enviar({ entidade: "tipos", csv: "nome" });
    expect(status).toBe(400);
  });

  it("acima do limite de linhas é recusado", async () => {
    const linhas = Array.from({ length: 1001 }, (_, i) => `Tipo ${i}`).join("\n");
    const { status, corpo } = await enviar({
      entidade: "tipos",
      csv: `nome\n${linhas}`,
    });
    expect(status).toBe(400);
    expect(String(corpo.erro)).toMatch(/limite/);
  });
});

describe("erro numa linha não arrasta as outras", () => {
  it("por padrão nada é gravado", async () => {
    const { status } = await enviar({
      entidade: "computadores",
      csv: "identificador;garantia ate\nPAT-1;06/08/2026\nPAT-2;31/02/2026",
      aplicar: true,
    });
    expect(status).toBe(400);
    expect(await prisma.computador.count()).toBe(0);
  });

  it("com ignorarErros grava só as linhas boas", async () => {
    const { status } = await enviar({
      entidade: "computadores",
      csv: "identificador;garantia ate\nPAT-1;06/08/2026\nPAT-2;31/02/2026",
      aplicar: true,
      ignorarErros: true,
    });
    expect(status).toBe(200);
    const ids = (await prisma.computador.findMany()).map((c) => c.identificador);
    expect(ids).toEqual(["PAT-1"]);
  });
});

describe("usuários", () => {
  it("senha em branco é sorteada, devolvida uma vez e confere com o hash", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel\nana.souza;Ana Souza;Operador",
      aplicar: true,
    });
    const senhas = plano(corpo).senhasSorteadas!;
    expect(senhas).toHaveLength(1);
    expect(senhas[0].login).toBe("ana.souza");

    const u = await prisma.usuario.findUnique({ where: { login: "ana.souza" } });
    expect(u?.papel).toBe("OPERADOR");
    expect(u?.senhaProvisoria).toBe(true);
    expect(await verificarSenha(senhas[0].senha, u!.senhaHash)).toBe(true);
  });

  it("senha da planilha vale, e nasce provisória", async () => {
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;senha\nana.souza;Ana;Operador;senha-boa-123",
      aplicar: true,
    });
    const u = await prisma.usuario.findUnique({ where: { login: "ana.souza" } });
    expect(await verificarSenha("senha-boa-123", u!.senhaHash)).toBe(true);
    expect(u?.senhaProvisoria).toBe(true);
  });

  it("senha curta erra a linha (regra do schema)", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;senha\nana.souza;Ana;Operador;123",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/8 caracteres/);
  });

  it("supervisor importado já vem com as salas dele", async () => {
    const sala = await prisma.sala.create({ data: { nome: "Sala 93", ordem: 1 } });
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;salas\nsup.ana;Ana;Supervisor;Sala 93",
      aplicar: true,
    });
    const u = await prisma.usuario.findUnique({
      where: { login: "sup.ana" },
      include: { supervisoes: true },
    });
    expect(u?.papel).toBe("SUPERVISOR");
    expect(u?.supervisoes.map((s) => s.salaId)).toEqual([sala.id]);
  });

  it("a própria conta de quem importa é recusada", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: `login;nome;papel;ativo\n${admin.login};Eu;Operador;Nao`,
      modo: "atualizar",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/própria conta/);
  });

  it("login com espaço erra a linha", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel\nana souza;Ana;Operador",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/letras, números/);
  });
});

// O código do Siscobra anda colado ao papel COBRANCA (decisão 27): ele só existe
// para quem atende devedor. A tela garante isso nos dois sentidos, e a
// importação não pode ser a porta dos fundos que deixa um código órfão.
describe("importação de usuários: código do Siscobra", () => {
  const usucodDe = async (login: string) =>
    (
      await prisma.usuario.findUnique({
        where: { login },
        select: { siscobraUsucod: true },
      })
    )?.siscobraUsucod ?? null;

  it("cobrança importada já vem com o código", async () => {
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\ncob.ana;Ana;Cobrança;1042",
      aplicar: true,
    });
    expect(await usucodDe("cob.ana")).toBe(1042);
  });

  it("código em papel que não é cobrança erra a linha", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\nana;Ana;Operador;1042",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/só vale para papel Cobrança/);
  });

  it("código inválido cai na mensagem do schema da tela", async () => {
    const { corpo } = await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\ncob.ana;Ana;Cobrança;zero",
    });
    expect(plano(corpo).linhas[0].erro).toMatch(/Código do Siscobra/);
  });

  it("rebaixar por planilha solta o código, como a tela faria", async () => {
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\ncob.ana;Ana;Cobrança;1042",
      aplicar: true,
    });
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel\ncob.ana;Ana;Operador",
      modo: "atualizar",
      aplicar: true,
    });
    expect(await usucodDe("cob.ana")).toBeNull();
  });

  it("célula vazia NÃO apaga o código de quem continua na cobrança", async () => {
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\ncob.ana;Ana;Cobrança;1042",
      aplicar: true,
    });
    await enviar({
      entidade: "usuarios",
      csv: "login;nome;papel;codigo siscobra\ncob.ana;Ana Souza;Cobrança;",
      modo: "atualizar",
      aplicar: true,
    });
    expect(await usucodDe("cob.ana")).toBe(1042);
  });
});

describe("modelo para baixar", () => {
  it("vem como CSV com BOM e o cabeçalho da entidade", async () => {
    const res = await modelo(
      await requisicao("GET", "/api/importar?entidade=funcionarios", {
        usuario: admin,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);

    // Tem de ser nos BYTES: `res.text()` decodifica em UTF-8 e a especificação
    // manda descartar o BOM inicial — pelo texto ele é invisível, e é justamente
    // ele que faz o Excel não trocar "Memória" por "MemÃ³ria".
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("nome;cargo;sala");
  });

  it("entidade desconhecida é recusada", async () => {
    const res = await modelo(
      await requisicao("GET", "/api/importar?entidade=chamados", {
        usuario: admin,
      }),
    );
    expect(res.status).toBe(400);
  });
});
