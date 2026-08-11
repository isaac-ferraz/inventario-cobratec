// Cliente do gateway de WhatsApp (WAHA) — o MODO DIRETO.
//
// ─────────────────────────── por que isto existe ───────────────────────────
//
// A decisão 28 desenhou o caminho de produção assim:
//
//     WhatsApp → WAHA → n8n (o chatbot) → inventário
//
// e o inventário não fala com gateway nenhum. Isso continua valendo: com
// `CHAT_ENVIO_URL` configurado, nada neste arquivo é usado.
//
// O modo direto existe para o que vem ANTES do chatbot: parear um número e
// trocar mensagem de verdade para ver a fila, o /chat e a resposta da operadora
// funcionando ponta a ponta — sem depender de um fluxo de n8n pronto. É o
// caminho de TESTE, ligado só quando `WAHA_URL` está no .env (decisão 29).
//
// A fronteira que a decisão 28 protege sobrevive inteira: o Siscobra continua
// fora do alcance deste app, e o dossiê continua chegando empurrado pelo
// webhook. O que o modo direto encurta é só o trecho do canal.
//
// Sem Twilio e sem API oficial da Meta: o WAHA automatiza o WhatsApp Web
// (multi-device). Isso contraria os termos do WhatsApp e o número pode ser
// banido — use um chip dedicado, nunca a linha principal do escritório.

export type ConfigWaha = {
  url: string;
  apiKey: string | null;
  sessao: string;
  webhookUrl: string;
};

// Rede de escritório com internet instável: sem teto, a tela da operadora
// ficaria pendurada sem saber se mandou ou não. Mesmo motivo do teto em
// lib/chat-envio.ts.
const TIMEOUT_MS = 15_000;

// O endereço que o WAHA usa para avisar ESTE app. Ele roda em container, então
// "localhost" ali dentro é o próprio container — daí `host.docker.internal`,
// que o docker-compose.waha.yml mapeia para o host (extra_hosts).
//
// Este padrão serve ao app rodando FORA do Docker (`npm run dev`). Com o app em
// container o valor certo é o nome do container, e o docker-compose.yml já o
// define — o padrão daqui nem chega a ser usado.
const WEBHOOK_PADRAO = "http://host.docker.internal:3000/api/chat/waha/webhook";

// Só `message` (mensagem que CHEGA) e o estado da sessão.
//
// `message.any` fica de fora de propósito: ele inclui as mensagens enviadas por
// nós, e no modo direto a resposta da operadora sai por este mesmo gateway —
// ela voltaria como eco e apareceria duplicada na thread.
const EVENTOS = ["message", "session.status"];

/** Config do modo direto, ou `null` quando ele não está ligado. */
export function configWaha(): ConfigWaha | null {
  const url = (process.env.WAHA_URL ?? "").trim().replace(/\/+$/, "");
  if (!url) return null;
  return {
    url,
    apiKey: process.env.WAHA_API_KEY?.trim() || null,
    // O WAHA Core só trabalha com a sessão "default"; a variável existe para
    // quem migrar para o Plus, que aceita várias.
    sessao: process.env.WAHA_SESSION?.trim() || "default",
    webhookUrl: process.env.WAHA_WEBHOOK_URL?.trim() || WEBHOOK_PADRAO,
  };
}

export type Resposta<T> =
  | { ok: true; dados: T }
  | { ok: false; status: number; motivo: string };

type Metodo = "GET" | "POST" | "PUT";

// Toda conversa com o gateway passa por aqui: um lugar só para o timeout, a
// chave da API e a tradução de falha de rede em mensagem que o TI entende.
async function chamar<T>(
  cfg: ConfigWaha,
  caminho: string,
  metodo: Metodo = "GET",
  corpo?: unknown,
): Promise<Resposta<T>> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}${caminho}`, {
      method: metodo,
      headers: {
        ...(cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {}),
        ...(corpo !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      // A mensagem do WAHA é útil ("Session status is not as expected...") e
      // vale mais para quem está ligando o serviço do que um erro genérico.
      const detalhe = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        motivo: resumirErro(res.status, detalhe),
      };
    }

    const json = (await res.json().catch(() => null)) as T;
    return { ok: true, dados: json };
  } catch (e) {
    const abortou = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      status: abortou ? 504 : 502,
      motivo: abortou
        ? "O gateway de WhatsApp não respondeu a tempo."
        : "Não foi possível falar com o gateway de WhatsApp (ele está no ar?).",
    };
  } finally {
    clearTimeout(relogio);
  }
}

function resumirErro(status: number, detalhe: string): string {
  if (status === 401) {
    return "O gateway recusou a chave (confira WAHA_API_KEY).";
  }
  try {
    const j = JSON.parse(detalhe) as { message?: unknown; error?: unknown };
    const m = typeof j.message === "string" ? j.message : null;
    const e = typeof j.error === "string" ? j.error : null;
    if (m || e) return `O gateway recusou (${status}): ${m ?? e}`;
  } catch {
    // corpo não-JSON: cai no genérico
  }
  return `O gateway recusou a operação (${status}).`;
}

// ─────────────────────────── sessão ───────────────────────────

export type SessaoWaha = {
  /** STOPPED | STARTING | SCAN_QR_CODE | WORKING | FAILED */
  status: string;
  /** Número pareado, já sem o sufixo do WhatsApp. Null enquanto não parear. */
  numero: string | null;
  nome: string | null;
  /** O webhook da sessão aponta para este app? */
  webhookOk: boolean;
};

type SessaoBruta = {
  status?: unknown;
  me?: { id?: unknown; pushName?: unknown } | null;
  config?: { webhooks?: Array<{ url?: unknown }> | null } | null;
};

function traduzirSessao(bruta: SessaoBruta, cfg: ConfigWaha): SessaoWaha {
  const id = typeof bruta.me?.id === "string" ? bruta.me.id : null;
  const ganchos = Array.isArray(bruta.config?.webhooks)
    ? bruta.config!.webhooks!
    : [];
  return {
    status: typeof bruta.status === "string" ? bruta.status : "DESCONHECIDO",
    numero: id ? id.replace(/@.*$/, "") : null,
    nome: typeof bruta.me?.pushName === "string" ? bruta.me.pushName : null,
    webhookOk: ganchos.some((g) => g?.url === cfg.webhookUrl),
  };
}

/** Estado da sessão. `dados: null` quando ela ainda nem foi criada (404). */
export async function statusSessao(
  cfg: ConfigWaha,
): Promise<Resposta<SessaoWaha | null>> {
  const r = await chamar<SessaoBruta>(
    cfg,
    `/api/sessions/${encodeURIComponent(cfg.sessao)}`,
  );
  if (!r.ok) {
    if (r.status === 404) return { ok: true, dados: null };
    return r;
  }
  return { ok: true, dados: traduzirSessao(r.dados ?? {}, cfg) };
}

function corpoConfig(cfg: ConfigWaha) {
  return {
    webhooks: [
      {
        url: cfg.webhookUrl,
        events: EVENTOS,
        // É assim que o webhook chega autenticado: o WAHA repete este cabeçalho
        // em toda entrega, e quem confere é `exigirServico` — o MESMO portão do
        // webhook do n8n. Um segredo só, um portão só.
        customHeaders: [
          {
            name: "Authorization",
            value: `Bearer ${process.env.CHAT_SERVICE_TOKEN ?? ""}`,
          },
        ],
      },
    ],
  };
}

/**
 * Deixa a sessão existindo, configurada e de pé — é o botão "Conectar" da tela.
 *
 * Idempotente de propósito: o TI vai clicar nele de novo toda vez que algo
 * parecer errado, e ele não pode derrubar uma sessão que já está funcionando.
 * Por isso o `PUT` (que reinicia a sessão para aplicar a config) só acontece
 * quando o webhook está mesmo diferente do esperado.
 */
export async function conectar(cfg: ConfigWaha): Promise<Resposta<SessaoWaha>> {
  const atual = await statusSessao(cfg);
  if (!atual.ok) return atual;

  if (atual.dados === null) {
    const criada = await chamar<SessaoBruta>(cfg, "/api/sessions", "POST", {
      name: cfg.sessao,
      start: true,
      config: corpoConfig(cfg),
    });
    if (!criada.ok) return criada;
    return { ok: true, dados: traduzirSessao(criada.dados ?? {}, cfg) };
  }

  if (!atual.dados.webhookOk) {
    const ajustada = await chamar<SessaoBruta>(
      cfg,
      `/api/sessions/${encodeURIComponent(cfg.sessao)}`,
      "PUT",
      { config: corpoConfig(cfg) },
    );
    if (!ajustada.ok) return ajustada;
    return { ok: true, dados: traduzirSessao(ajustada.dados ?? {}, cfg) };
  }

  // Parada é diferente de caída, e o gateway trata as duas de forma diferente:
  //
  //   STOPPED → `start` sobe a sessão;
  //   FAILED  → `start` responde 201 dizendo "Session is already running" e
  //             NÃO faz nada. Só `restart` (que para antes de subir) recupera.
  //
  // Sem esta distinção o botão "Conectar" vira um botão que mente: mostra
  // "sessão iniciada" e deixa a tela em falha para sempre. O caminho comum para
  // cair em FAILED é o mais banal de todos — o QR expirou sem ninguém ler
  // ("QR refs attempts ended"), e é exatamente aí que a pessoa clica de novo.
  if (atual.dados.status === "STOPPED" || atual.dados.status === "FAILED") {
    const acao = atual.dados.status === "FAILED" ? "restart" : "start";
    const iniciada = await chamar<SessaoBruta>(
      cfg,
      `/api/sessions/${encodeURIComponent(cfg.sessao)}/${acao}`,
      "POST",
    );
    if (!iniciada.ok) return iniciada;
    return { ok: true, dados: traduzirSessao(iniciada.dados ?? {}, cfg) };
  }

  return { ok: true, dados: atual.dados };
}

/** Para a sessão. O pareamento continua salvo: "Conectar" volta sem QR novo. */
export async function parar(cfg: ConfigWaha): Promise<Resposta<unknown>> {
  return chamar(
    cfg,
    `/api/sessions/${encodeURIComponent(cfg.sessao)}/stop`,
    "POST",
  );
}

/** Desvincula o celular. O próximo "Conectar" pede QR de novo. */
export async function desconectar(cfg: ConfigWaha): Promise<Resposta<unknown>> {
  return chamar(
    cfg,
    `/api/sessions/${encodeURIComponent(cfg.sessao)}/logout`,
    "POST",
  );
}

/** QR do pareamento, em PNG. Só existe enquanto o status é SCAN_QR_CODE. */
export async function qrCode(
  cfg: ConfigWaha,
): Promise<Resposta<{ bytes: ArrayBuffer; tipo: string }>> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${cfg.url}/api/${encodeURIComponent(cfg.sessao)}/auth/qr?format=image`,
      {
        headers: cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : undefined,
        signal: controle.signal,
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        motivo:
          res.status === 422
            ? "A sessão não está esperando QR agora (talvez já esteja conectada)."
            : resumirErro(res.status, detalhe),
      };
    }
    return {
      ok: true,
      dados: {
        bytes: await res.arrayBuffer(),
        tipo: res.headers.get("content-type") ?? "image/png",
      },
    };
  } catch (e) {
    const abortou = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      status: abortou ? 504 : 502,
      motivo: abortou
        ? "O gateway de WhatsApp não respondeu a tempo."
        : "Não foi possível falar com o gateway de WhatsApp (ele está no ar?).",
    };
  } finally {
    clearTimeout(relogio);
  }
}

// ─────────────────────────── envio ───────────────────────────

export async function enviarTexto(
  cfg: ConfigWaha,
  telefone: string,
  corpo: string,
): Promise<Resposta<{ waId: string | null }>> {
  const r = await chamar<unknown>(cfg, "/api/sendText", "POST", {
    session: cfg.sessao,
    chatId: chatIdDe(telefone),
    text: corpo,
  });
  if (!r.ok) return r;
  return { ok: true, dados: { waId: idDaMensagem(r.dados) } };
}

// ─────────────────────────── traduções puras ───────────────────────────
//
// Daqui para baixo não há rede: são as conversões entre o vocabulário do
// WhatsApp (JID, evento, payload) e o do sistema (telefone em E.164). Ficam
// puras para serem testadas sem gateway nenhum — mesmo motivo de lib/conversas.ts.

/** "5512997654321" → "5512997654321@c.us" (o endereço de um contato). */
export function chatIdDe(telefone: string): string {
  return `${(telefone ?? "").replace(/\D/g, "")}@c.us`;
}

/**
 * "5512997654321@c.us" → "5512997654321".
 *
 * Devolve `null` para tudo que não é conversa com uma pessoa: grupo (`@g.us`),
 * status/broadcast e canal. Grupo é o caso que importa — cobrar dívida em grupo
 * expõe o devedor a terceiros, e o modo direto não tem como saber quem está lá.
 */
export function telefoneDoChatId(chatId: unknown): string | null {
  if (typeof chatId !== "string") return null;
  const [numero, dominio] = chatId.split("@");
  if (dominio !== "c.us" && dominio !== "s.whatsapp.net") return null;
  const digitos = (numero ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

/**
 * O telefone do remetente, procurado onde ele possa estar.
 *
 * O WhatsApp está migrando o endereçamento para **LID** (`1234567@lid`), um
 * identificador que NÃO é telefone. Quando o remetente chega assim, o número
 * real vem num campo ao lado — e o nome desse campo varia com a versão do
 * gateway. Por isso a busca é por candidatos, e não por um campo fixo: a
 * identidade da conversa é o telefone (`Conversa.telefone` é UNIQUE), e gravar
 * um LID no lugar dele criaria uma segunda conversa para a mesma pessoa.
 *
 * Nenhum candidato serve → a mensagem é ignorada e o motivo vai para o log
 * (`diagnosticoDoEvento`), com o domínio à vista. Chutar aqui é pior: um id que
 * não é telefone quebra o envio da resposta e o histórico do devedor.
 */
function telefoneDoEvento(p: Record<string, unknown>): string | null {
  const dados = (p._data ?? {}) as { key?: Record<string, unknown> };
  const chave = (dados.key ?? {}) as Record<string, unknown>;
  const candidatos = [
    p.from,
    p.senderPn,
    p.participantPn,
    chave.remoteJidAlt,
    chave.senderPn,
    chave.remoteJid,
  ];
  for (const c of candidatos) {
    const telefone = telefoneDoChatId(c);
    if (telefone) return telefone;
  }
  return null;
}

export type MensagemRecebida = {
  telefone: string;
  corpo: string;
  waId: string | null;
  nome: string | null;
  /** Tipo da mídia, quando a mensagem não era texto ("áudio", "imagem"…). */
  midia: string | null;
  /** Onde buscar o anexo no gateway. Null quando não há o que baixar. */
  midiaUrl: string | null;
  midiaMime: string | null;
};

// Teto igual ao do webhook do n8n (`conversaWebhookSchema`): o gateway não
// valida tamanho, e uma mensagem gigante não pode entrar por uma porta e ser
// recusada na outra.
const MAX_CORPO = 5000;

/**
 * Extrai a fala do devedor de um evento do WAHA — ou `null` quando o evento
 * não é para ser gravado.
 *
 * O `null` cobre três casos, e cada um tem motivo:
 *   - evento que não é mensagem (`session.status`, ack, presença);
 *   - `fromMe`: a própria resposta da operadora voltando como eco;
 *   - grupo/broadcast: ver `telefoneDoChatId`.
 *
 * Mídia (áudio, foto, documento) **entra**, com um marcador no lugar do
 * conteúdo. O arquivo continua sem ser baixado — o que muda é que o devedor
 * deixa de ser invisível. Engolir a mensagem em silêncio fazia a pessoa que
 * mandou um áudio simplesmente não existir para quem atende, e ninguém
 * descobriria o porquê.
 *
 * A rota trata `null` como sucesso: recusar faria o WAHA reentregar para sempre
 * um evento que nunca vai ser aceito.
 */
export function mensagemDoEvento(evento: unknown): MensagemRecebida | null {
  const e = evento as { event?: unknown; payload?: Record<string, unknown> };
  if (e?.event !== "message" && e?.event !== "message.any") return null;

  const p = e.payload;
  if (!p || typeof p !== "object") return null;
  if (p.fromMe === true) return null;

  const telefone = telefoneDoEvento(p);
  if (!telefone) return null;

  const texto = typeof p.body === "string" ? p.body.trim() : "";
  const midia = descreverMidia(p);
  // Nem texto nem mídia reconhecida: sobra revogação, reação, enquete e outros
  // eventos que não são fala. Não viram mensagem.
  if (!texto && !midia) return null;

  const dados = (p._data ?? {}) as Record<string, unknown>;
  const nome =
    primeiroTexto(p.notifyName, dados.pushName, dados.notifyName) ?? null;

  // Com mídia + legenda, os dois aparecem: "[imagem] segue o comprovante".
  const corpo = midia ? `[${midia}]${texto ? ` ${texto}` : ""}` : texto;

  return {
    telefone,
    corpo: corpo.slice(0, MAX_CORPO),
    waId: typeof p.id === "string" ? p.id : null,
    nome,
    midia,
    midiaUrl: midia ? urlBrutaDaMidia(p) : null,
    midiaMime: midia ? mimeDaMidia(p) : null,
  };
}

function urlBrutaDaMidia(p: Record<string, unknown>): string | null {
  const m = (p.media ?? {}) as { url?: unknown };
  return typeof m.url === "string" && m.url ? m.url : null;
}

function mimeDaMidia(p: Record<string, unknown>): string | null {
  const m = (p.media ?? {}) as { mimetype?: unknown };
  if (typeof m.mimetype === "string") return m.mimetype;
  const solto = (p as { mimetype?: unknown }).mimetype;
  return typeof solto === "string" ? solto : null;
}

/**
 * O endereço do anexo **como este app o alcança**.
 *
 * O gateway monta a URL do arquivo com o hostname que ele conhece de si mesmo
 * ("localhost", o id do container). Vinda de fora, essa URL não resolve. Como o
 * caminho é o mesmo, reaproveita-se o caminho e troca-se a base pela que já
 * funciona — a mesma que serve para toda chamada de API.
 *
 * URL de outra origem que não o gateway é RECUSADA: baixar de um endereço
 * arbitrário que chegou pelo webhook seria pedir para o servidor buscar
 * qualquer coisa da rede interna (SSRF).
 */
export function urlDaMidia(cfg: ConfigWaha, bruta: string | null): string | null {
  if (!bruta) return null;
  try {
    const alvo = new URL(bruta);
    const base = new URL(cfg.url);
    return `${base.origin}${alvo.pathname}${alvo.search}`;
  } catch {
    // Caminho relativo ("/api/files/…") também serve.
    return bruta.startsWith("/") ? `${cfg.url}${bruta}` : null;
  }
}

// Do mimetype ao substantivo que a operadora lê na thread. O tipo importa mais
// que o arquivo: "áudio" ela ouve no WhatsApp, "comprovante" ela vai querer ver.
function descreverMidia(p: Record<string, unknown>): string | null {
  const midia = (p.media ?? {}) as { mimetype?: unknown };
  const mime =
    typeof midia.mimetype === "string"
      ? midia.mimetype
      : typeof (p as { mimetype?: unknown }).mimetype === "string"
        ? (p as { mimetype: string }).mimetype
        : null;

  if (mime) {
    if (mime.startsWith("audio/")) return "áudio";
    if (mime.startsWith("image/")) return "imagem";
    if (mime.startsWith("video/")) return "vídeo";
    if (mime === "application/pdf") return "documento PDF";
    return "arquivo";
  }
  // `hasMedia` sem mimetype acontece quando o gateway não baixou o arquivo.
  return p.hasMedia === true ? "arquivo" : null;
}

/**
 * Uma linha descrevendo o evento — para o log, quando ele é ignorado.
 *
 * **Sem conteúdo e sem número**: só o domínio do endereço, os sinalizadores e o
 * tipo. Log de servidor não é lugar de mensagem de devedor (LGPD), e para saber
 * POR QUE algo não apareceu na fila isto basta.
 *
 * Existe porque a primeira versão descartava em silêncio: o gateway entregava,
 * o app respondia 200, e não havia como saber se o filtro tinha razão.
 */
export function diagnosticoDoEvento(evento: unknown): string {
  const e = evento as { event?: unknown; payload?: Record<string, unknown> };
  const p = (e?.payload ?? {}) as Record<string, unknown>;
  const dominio =
    typeof p.from === "string" ? (p.from.split("@")[1] ?? "sem-dominio") : "sem-from";
  const partes = [
    `event=${typeof e?.event === "string" ? e.event : "?"}`,
    `from=@${dominio}`,
    `fromMe=${p.fromMe === true}`,
    `texto=${typeof p.body === "string" && p.body.trim() ? "sim" : "não"}`,
    `midia=${descreverMidia(p) ?? "não"}`,
  ];
  return partes.join(" ");
}

/**
 * Id da mensagem na resposta do envio.
 *
 * Três formatos porque os motores do WAHA não concordam: o NOWEB devolve `id`
 * como texto, o WEBJS como objeto com `_serialized`. Sem id o envio não falha —
 * ele só perde a trava contra duplicata do eco.
 */
export function idDaMensagem(resposta: unknown): string | null {
  const r = resposta as
    | { id?: unknown; _data?: { id?: { _serialized?: unknown } } }
    | null;
  if (!r) return null;
  if (typeof r.id === "string") return r.id;
  const serializado = (r.id as { _serialized?: unknown } | undefined)
    ?._serialized;
  if (typeof serializado === "string") return serializado;
  const doData = r._data?.id?._serialized;
  return typeof doData === "string" ? doData : null;
}

function primeiroTexto(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return null;
}
