// O portão de navegação, papel por papel.
//
// Este é o teste que faltava: as rotas de API já tinham cobertura, mas o
// middleware — que decide quem entra em qual TELA — não tinha nenhuma. Ele roda
// no Edge, sem banco, e julga só pelo papel gravado no cookie; foi exatamente aí
// que o supervisor morreu (cookie assinado como OPERADOR pelo login).
//
// Não toca no banco: o middleware não consulta Prisma, então cookie assinado
// basta — é a mesma coisa que ele recebe em produção.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { cookieDe, type UsuarioTeste } from "./ajuda";

const ADMIN: UsuarioTeste = { id: "u-admin", login: "chefe", papel: "ADMIN" };
const SUP: UsuarioTeste = { id: "u-sup", login: "sup", papel: "SUPERVISOR" };
const COB: UsuarioTeste = { id: "u-cob", login: "cob", papel: "COBRANCA" };
const OPE: UsuarioTeste = { id: "u-ope", login: "ope", papel: "OPERADOR" };

async function ir(caminho: string, quem?: UsuarioTeste) {
  const cabecalhos: Record<string, string> = {};
  if (quem) cabecalhos.cookie = await cookieDe(quem);
  const res = await middleware(
    new NextRequest(
      new Request(`http://localhost${caminho}`, { headers: cabecalhos }),
    ),
  );
  return {
    status: res.status,
    destino: res.headers.get("location")
      ? new URL(res.headers.get("location")!).pathname
      : null,
  };
}

const TELAS_INVENTARIO = [
  "/",
  "/computadores",
  "/celulares",
  "/funcionarios",
  "/salas",
  "/manutencoes",
];
const TELAS_SO_DO_TI = ["/usuarios", "/tipos", "/auditoria", "/deposito"];

describe("sem sessão", () => {
  it("toda tela manda para o login guardando o destino", async () => {
    for (const tela of [...TELAS_INVENTARIO, ...TELAS_SO_DO_TI, "/chamados"]) {
      const { status, destino } = await ir(tela);
      expect(status, tela).toBe(307);
      expect(destino, tela).toBe("/login");
    }
  });

  it("API sem sessão responde 401, não redireciona", async () => {
    const { status } = await ir("/api/computadores");
    expect(status).toBe(401);
  });

  it("login e healthcheck seguem abertos", async () => {
    expect((await ir("/login")).status).toBe(200);
    expect((await ir("/api/health")).status).toBe(200);
  });

  // O n8n não tem cookie: se o middleware o barrasse, nenhuma mensagem de
  // WhatsApp entraria — e o defeito apareceria como "o robô não responde",
  // longe daqui. Quem confere o token é `exigirServico`, dentro da rota.
  it("o webhook das conversas passa sem cookie (token é conferido na rota)", async () => {
    expect((await ir("/api/chat/webhook")).status).toBe(200);
  });

  // A liberação é do caminho EXATO. Se fosse por prefixo, a fila e o dossiê
  // ficariam abertos para quem não está logado.
  it("mas o resto de /api/chat continua exigindo sessão", async () => {
    expect((await ir("/api/chat/conversas")).status).toBe(401);
    expect((await ir("/api/chat/webhook/qualquer-coisa")).status).toBe(401);
  });
});

describe("administrador", () => {
  it("passa em tudo", async () => {
    for (const tela of [
      ...TELAS_INVENTARIO,
      ...TELAS_SO_DO_TI,
      "/chamados",
      "/chat",
    ]) {
      expect((await ir(tela, ADMIN)).status, tela).toBe(200);
    }
  });
});

describe("supervisor de sala", () => {
  it("entra nas telas de inventário — o bug que este arquivo existe para pegar", async () => {
    for (const tela of TELAS_INVENTARIO) {
      const { status, destino } = await ir(tela, SUP);
      expect(status, `${tela} deveria abrir para o supervisor`).toBe(200);
      expect(destino, tela).toBeNull();
    }
  });

  it("alcança as APIs do inventário dele", async () => {
    for (const rota of [
      "/api/computadores",
      "/api/celulares",
      "/api/funcionarios",
      "/api/salas",
      "/api/manutencoes",
      "/api/componentes",
      "/api/tipos",
    ]) {
      expect((await ir(rota, SUP)).status, rota).toBe(200);
    }
  });

  it("não alcança as telas globais do TI", async () => {
    for (const tela of TELAS_SO_DO_TI) {
      const { status, destino } = await ir(tela, SUP);
      expect(status, tela).toBe(307);
      expect(destino, tela).toBe("/");
    }
  });

  it("API global responde 403 (não redireciona)", async () => {
    expect((await ir("/api/usuarios", SUP)).status).toBe(403);
    expect((await ir("/api/auditoria", SUP)).status).toBe(403);
    expect((await ir("/api/export", SUP)).status).toBe(403);
    expect((await ir("/api/deposito", SUP)).status).toBe(403);
  });

  it("usa o helpdesk como qualquer um", async () => {
    expect((await ir("/chamados", SUP)).status).toBe(200);
  });
});

describe("operadora de cobrança", () => {
  it("entra no /chat — o motivo de o papel existir", async () => {
    const { status, destino } = await ir("/chat", COB);
    expect(status).toBe(200);
    expect(destino).toBeNull();
  });

  it("alcança a API das conversas", async () => {
    expect((await ir("/api/chat", COB)).status).toBe(200);
    expect((await ir("/api/chat/conversas", COB)).status).toBe(200);
  });

  it("leva junto o que o operador tem: chamados e troca de senha", async () => {
    expect((await ir("/chamados", COB)).status).toBe(200);
    expect((await ir("/trocar-senha", COB)).status).toBe(200);
    expect((await ir("/api/chamados", COB)).status).toBe(200);
  });

  it("é devolvida para /chat em qualquer tela de inventário", async () => {
    for (const tela of [...TELAS_INVENTARIO, ...TELAS_SO_DO_TI]) {
      const { status, destino } = await ir(tela, COB);
      expect(status, tela).toBe(307);
      expect(destino, tela).toBe("/chat");
    }
  });

  it("as APIs de inventário respondem 403", async () => {
    for (const rota of [
      "/api/computadores",
      "/api/celulares",
      "/api/funcionarios",
      "/api/salas",
      "/api/usuarios",
      "/api/deposito",
      "/api/auditoria",
    ]) {
      expect((await ir(rota, COB)).status, rota).toBe(403);
    }
  });
});

describe("relatórios de cobrança (decisão 35)", () => {
  // A tela mostra produção AGREGADA da operação — acordo, acionamento, hora,
  // situação. Nenhum devedor. É por isso que ela abre para o supervisor sem
  // reabrir a porta que a decisão 27 fechou: a das conversas.
  const ROTAS = [
    "/relatorios/cobranca",
    "/api/relatorios/cobranca",
    "/api/relatorios/cobranca/filtros",
  ];

  it("admin e supervisor entram", async () => {
    for (const quem of [ADMIN, SUP]) {
      for (const rota of ROTAS) {
        expect((await ir(rota, quem)).status, `${quem.papel} ${rota}`).toBe(200);
      }
    }
  });

  it("o supervisor entra no relatório e continua fora das conversas", async () => {
    expect((await ir("/relatorios/cobranca", SUP)).status).toBe(200);
    expect((await ir("/chat", SUP)).destino).toBe("/");
  });

  it("a operadora de cobrança NÃO entra — o relatório é um ranking das colegas", async () => {
    expect((await ir("/relatorios/cobranca", COB)).destino).toBe("/chat");
    expect((await ir("/api/relatorios/cobranca", COB)).status).toBe(403);
  });

  it("operador é barrado", async () => {
    expect((await ir("/relatorios/cobranca", OPE)).destino).toBe("/chamados");
    expect((await ir("/api/relatorios/cobranca", OPE)).status).toBe(403);
  });

  it("sem sessão vai para o login", async () => {
    expect((await ir("/relatorios/cobranca")).destino).toBe("/login");
    expect((await ir("/api/relatorios/cobranca")).status).toBe(401);
  });
});

describe("quem NÃO é da cobrança não alcança as conversas", () => {
  // O /chat carrega dado pessoal de devedor (CPF, dívida) sob LGPD. Que ele
  // esteja fechado para supervisor e operador é regra, não detalhe: o alcance
  // se decide pelo ofício, nunca pela sala.
  it("supervisor de sala é barrado", async () => {
    expect((await ir("/chat", SUP)).destino).toBe("/");
    expect((await ir("/api/chat/conversas", SUP)).status).toBe(403);
  });

  it("operador de helpdesk é barrado", async () => {
    expect((await ir("/chat", OPE)).destino).toBe("/chamados");
    expect((await ir("/api/chat/conversas", OPE)).status).toBe(403);
  });

  it("sem sessão vai para o login", async () => {
    expect((await ir("/chat")).destino).toBe("/login");
    expect((await ir("/api/chat/conversas")).status).toBe(401);
  });
});

describe("operador", () => {
  it("só alcança chamados e a troca de senha", async () => {
    expect((await ir("/chamados", OPE)).status).toBe(200);
    expect((await ir("/trocar-senha", OPE)).status).toBe(200);
  });

  it("é devolvido para /chamados em qualquer tela de inventário", async () => {
    for (const tela of [...TELAS_INVENTARIO, ...TELAS_SO_DO_TI]) {
      const { status, destino } = await ir(tela, OPE);
      expect(status, tela).toBe(307);
      expect(destino, tela).toBe("/chamados");
    }
  });

  it("as APIs de inventário respondem 403", async () => {
    for (const rota of [
      "/api/computadores",
      "/api/celulares",
      "/api/funcionarios",
      "/api/salas",
      "/api/usuarios",
      "/api/deposito",
    ]) {
      expect((await ir(rota, OPE)).status, rota).toBe(403);
    }
  });

  it("a API de chamados é dele", async () => {
    expect((await ir("/api/chamados", OPE)).status).toBe(200);
  });
});

describe("cookie forjado", () => {
  it("assinatura inválida vale como não ter sessão", async () => {
    const res = await middleware(
      new NextRequest(
        new Request("http://localhost/computadores", {
          headers: { cookie: "sessao=payload-invente.assinatura-falsa" },
        }),
      ),
    );
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
