// Traduções entre o vocabulário do WhatsApp e o do sistema.
//
// O que se protege aqui é o que decide se uma mensagem VIRA atendimento: o eco
// da própria resposta, o grupo (cobrar dívida na frente de terceiro), o áudio
// que o modelo não guarda. Errar para o lado do "grava" é vazamento ou thread
// duplicada; errar para o lado do "ignora" é devedor invisível.
import { describe, expect, it } from "vitest";
import {
  chatIdDe,
  diagnosticoDoEvento,
  idDaMensagem,
  mensagemDoEvento,
  telefoneDoChatId,
  urlDaMidia,
} from "@/lib/waha";
import { caminhoDoArquivo, nomeDeArquivo } from "@/lib/chat-midia";

// Envelope real do WAHA 2026.7 (conferido contra o container).
function evento(payload: Record<string, unknown>, tipo = "message") {
  return {
    id: "evt_01",
    timestamp: 1786468853561,
    event: tipo,
    session: "default",
    me: { id: "5512988887777@c.us", pushName: "Cobratec" },
    engine: "NOWEB",
    payload,
  };
}

const FALA = {
  id: "false_5512997654321@c.us_3EB0",
  from: "5512997654321@c.us",
  fromMe: false,
  body: "Oi, recebi uma mensagem de vocês",
  _data: { pushName: "Ana" },
};

describe("chatId e telefone", () => {
  it("telefone vira endereço de contato", () => {
    expect(chatIdDe("5512997654321")).toBe("5512997654321@c.us");
    expect(chatIdDe("+55 (12) 99765-4321")).toBe("5512997654321@c.us");
  });

  it("endereço de contato vira telefone", () => {
    expect(telefoneDoChatId("5512997654321@c.us")).toBe("5512997654321");
    expect(telefoneDoChatId("5512997654321@s.whatsapp.net")).toBe(
      "5512997654321",
    );
  });

  // Grupo é o caso grave: cobrar dívida em grupo expõe o devedor a terceiros, e
  // não há como saber quem está lá.
  it("grupo, broadcast e canal não viram conversa", () => {
    expect(telefoneDoChatId("120363000000000000@g.us")).toBeNull();
    expect(telefoneDoChatId("status@broadcast")).toBeNull();
    expect(telefoneDoChatId("123@newsletter")).toBeNull();
    expect(telefoneDoChatId(undefined)).toBeNull();
  });
});

describe("o que vira mensagem gravada", () => {
  it("fala do devedor entra inteira", () => {
    expect(mensagemDoEvento(evento(FALA))).toEqual({
      telefone: "5512997654321",
      corpo: "Oi, recebi uma mensagem de vocês",
      waId: "false_5512997654321@c.us_3EB0",
      nome: "Ana",
      midia: null,
      midiaUrl: null,
      midiaMime: null,
    });
  });

  // A resposta da operadora sai por este mesmo gateway; sem esta trava ela
  // voltaria como eco e apareceria duas vezes na thread.
  it("a própria fala (fromMe) é ignorada", () => {
    expect(mensagemDoEvento(evento({ ...FALA, fromMe: true }))).toBeNull();
  });

  it("mensagem de grupo é ignorada", () => {
    const emGrupo = { ...FALA, from: "120363000000000000@g.us" };
    expect(mensagemDoEvento(evento(emGrupo))).toBeNull();
  });

  // Mídia entra com marcador: o arquivo não é baixado, mas quem mandou um
  // áudio deixa de ser invisível para quem atende.
  it("áudio vira mensagem com marcador", () => {
    const audio = {
      ...FALA,
      body: "",
      hasMedia: true,
      media: { mimetype: "audio/ogg; codecs=opus" },
    };
    const r = mensagemDoEvento(evento(audio));
    expect(r?.corpo).toBe("[áudio]");
    expect(r?.midia).toBe("áudio");
  });

  it("imagem com legenda mostra as duas coisas", () => {
    const foto = {
      ...FALA,
      body: "segue o comprovante",
      hasMedia: true,
      media: { mimetype: "image/jpeg" },
    };
    expect(mensagemDoEvento(evento(foto))?.corpo).toBe(
      "[imagem] segue o comprovante",
    );
  });

  it("mídia sem mimetype ainda entra como arquivo", () => {
    const anexo = { ...FALA, body: "", hasMedia: true };
    expect(mensagemDoEvento(evento(anexo))?.corpo).toBe("[arquivo]");
  });

  // Sobra o que não é fala: revogação, reação, enquete.
  it("evento sem texto e sem mídia é ignorado", () => {
    expect(mensagemDoEvento(evento({ ...FALA, body: "" }))).toBeNull();
    expect(mensagemDoEvento(evento({ ...FALA, body: "   " }))).toBeNull();
    expect(mensagemDoEvento(evento({ ...FALA, body: undefined }))).toBeNull();
  });

  // O WhatsApp está migrando para LID, que não é telefone. O número real vem
  // num campo ao lado, e gravar o LID criaria uma segunda conversa da mesma
  // pessoa (`Conversa.telefone` é UNIQUE).
  it("remetente em LID usa o telefone que vier ao lado", () => {
    const lid = {
      ...FALA,
      from: "199887766554433@lid",
      _data: { pushName: "Ana", key: { remoteJidAlt: "5512997654321@s.whatsapp.net" } },
    };
    expect(mensagemDoEvento(evento(lid))?.telefone).toBe("5512997654321");
  });

  it("LID sem telefone nenhum é ignorado, não chutado", () => {
    const lid = { ...FALA, from: "199887766554433@lid", _data: {} };
    expect(mensagemDoEvento(evento(lid))).toBeNull();
  });

  it("evento que não é mensagem é ignorado", () => {
    const status = evento({ name: "default", status: "WORKING" }, "session.status");
    expect(mensagemDoEvento(status)).toBeNull();
    expect(mensagemDoEvento(null)).toBeNull();
    expect(mensagemDoEvento({ event: "message" })).toBeNull();
  });

  // O log é a única resposta para "por que não apareceu na fila?".
  it("o diagnóstico diz o porquê sem vazar conteúdo nem número", () => {
    const d = diagnosticoDoEvento(evento({ ...FALA, fromMe: true }));
    expect(d).toContain("event=message");
    expect(d).toContain("from=@c.us");
    expect(d).toContain("fromMe=true");
    // Nada do que o devedor escreveu, nada do telefone dele.
    expect(d).not.toContain("5512997654321");
    expect(d).not.toContain("recebi uma mensagem");
  });

  it("o diagnóstico mostra o domínio do endereço, que é o que resolve LID", () => {
    const lid = { ...FALA, from: "199887766554433@lid" };
    expect(diagnosticoDoEvento(evento(lid))).toContain("from=@lid");
    expect(diagnosticoDoEvento(evento({}, "session.status"))).toContain(
      "from=@sem-from",
    );
  });

  it("nome cai para o do payload quando não há pushName", () => {
    const semPush = { ...FALA, _data: {}, notifyName: "Ana Souza" };
    expect(mensagemDoEvento(evento(semPush))?.nome).toBe("Ana Souza");
    const anonimo = { ...FALA, _data: {} };
    expect(mensagemDoEvento(evento(anonimo))?.nome).toBeNull();
  });

  // Mesmo teto do webhook do n8n: a mesma fala não pode entrar por uma porta e
  // ser recusada na outra.
  it("corpo gigante é cortado em 5000", () => {
    const longo = { ...FALA, body: "x".repeat(6000) };
    expect(mensagemDoEvento(evento(longo))?.corpo).toHaveLength(5000);
  });
});

describe("endereço do anexo", () => {
  const cfg = {
    url: "http://cobratec-waha:3000",
    apiKey: "k",
    sessao: "default",
    webhookUrl: "http://app/webhook",
  };

  // O gateway monta a URL com o hostname que ele conhece de si mesmo; vinda de
  // fora, ela não resolve. O caminho é o mesmo, a base é que muda.
  it("reescreve a base para a que este app alcança", () => {
    expect(urlDaMidia(cfg, "http://localhost:3000/api/files/default/x.ogg")).toBe(
      "http://cobratec-waha:3000/api/files/default/x.ogg",
    );
    expect(urlDaMidia(cfg, "/api/files/default/x.ogg")).toBe(
      "http://cobratec-waha:3000/api/files/default/x.ogg",
    );
  });

  // Baixar de um endereço arbitrário que chegou pelo webhook seria pedir para o
  // servidor buscar qualquer coisa da rede interna (SSRF).
  it("nunca sai da origem do gateway", () => {
    const fora = urlDaMidia(cfg, "http://192.168.0.253:5432/segredo");
    expect(fora).toBe("http://cobratec-waha:3000/segredo");
    expect(urlDaMidia(cfg, "lixo-sem-esquema")).toBeNull();
    expect(urlDaMidia(cfg, null)).toBeNull();
  });
});

describe("arquivo do anexo no disco", () => {
  // Nome derivado do id da mensagem, e não do nome que veio do WhatsApp: nome
  // de arquivo de terceiro é entrada não confiável.
  it("o nome não tem nada que o remetente controle", () => {
    const nome = nomeDeArquivo("cmsx123", "audio/ogg; codecs=opus");
    expect(nome).toMatch(/^[0-9a-f]{24}\.ogg$/);
    expect(nomeDeArquivo("cmsx123", null)).toMatch(/\.bin$/);
    // Estável: a mesma mensagem sempre aponta para o mesmo arquivo.
    expect(nomeDeArquivo("cmsx123", "audio/ogg")).toBe(
      nomeDeArquivo("cmsx123", "audio/ogg"),
    );
  });

  it("travessia de diretório é recusada", () => {
    expect(caminhoDoArquivo("../../prisma/dev.db")).toBeNull();
    expect(caminhoDoArquivo("/etc/passwd")).toBeNull();
    expect(caminhoDoArquivo("..")).toBeNull();
    expect(caminhoDoArquivo("abc123.ogg")).toContain("abc123.ogg");
  });
});

describe("id da mensagem enviada", () => {
  it("aceita os formatos dos dois motores", () => {
    expect(idDaMensagem({ id: "true_551_ABC" })).toBe("true_551_ABC");
    expect(idDaMensagem({ id: { _serialized: "true_551_DEF" } })).toBe(
      "true_551_DEF",
    );
    expect(idDaMensagem({ _data: { id: { _serialized: "true_551_GHI" } } })).toBe(
      "true_551_GHI",
    );
  });

  // Sem id o envio NÃO falha: ele só perde a trava contra duplicata.
  it("resposta sem id não quebra o envio", () => {
    expect(idDaMensagem(null)).toBeNull();
    expect(idDaMensagem({})).toBeNull();
    expect(idDaMensagem({ id: 42 })).toBeNull();
  });
});
