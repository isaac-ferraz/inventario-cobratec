// A entrega do relatório diário por SMTP — o e-mail sai do PROGRAMA, não do agente.
//
// ────────────────────── por que isto existe (decisão 43) ──────────────────────
//
// Até aqui o e-mail era trabalho do agente: ele lia o `.xlsx` do disco, convertia
// para base64 e redigitava os ~30 mil caracteres dentro da ferramenta do Gmail.
// Isso contradizia a própria decisão 42. Lá está escrito que nenhum número que o
// cliente lê passa por um modelo — mas o ANEXO INTEIRO passava, caractere a
// caractere, e um só trocado no meio do zip é uma planilha que não abre.
//
// Havia mais três defeitos no mesmo passo, e cada um sozinho já bastaria:
//
//   • dependia de uma sessão de chat aberta, com o conector do Gmail autorizado
//     e a permissão liberada — três coisas que não sobrevivem sozinhas entre um
//     dia e o outro, e o relatório é DIÁRIO;
//   • passava 30 KB pelo modelo toda manhã, o que é caro e lento para um trabalho
//     que o `nodemailer` faz em 200ms;
//   • falhava de um jeito que não deixava rastro no programa: quem olhasse os
//     logs do script veria "tudo certo, planilha gerada" e a caixa de entrada
//     vazia.
//
// Agora o script entrega. O agente vira o que ele deveria ter sido desde o
// começo: roda um comando e conta o que aconteceu.
//
// ─────────────────────────── a garantia que fica ───────────────────────────
//
// A decisão 42 escolheu RASCUNHO para que nada chegasse ao cliente sem uma
// pessoa decidir. Enviar por SMTP mantém a garantia, porque **o destino é o
// próprio usuário**: o relatório cai na caixa de entrada dele, e o encaminhamento
// para o cliente continua sendo um ato humano. O padrão de `RELATORIO_EMAIL_PARA`
// é a própria conta que autentica no SMTP — para mandar para outro lugar é
// preciso escrever o endereço no `.env`, de propósito, com a mão.
//
// Por isso `enviarRelatorio` devolve para onde mandou, e o script imprime esse
// endereço: conta trocada no `.env` é o erro que ninguém percebe olhando o log.
//
// ───────────────── quem entrega hoje é o Resend (decisão 44) ─────────────────
//
// A 43 nasceu apontada para o Gmail, e o Gmail cobrou o preço que ele sempre
// cobra: verificação em duas etapas ligada, senha de app de 16 letras gerada à
// mão, e uma conta pessoal assinando um relatório de empresa. Brevo foi tentado
// no meio do caminho e ficou pela metade no `.env`.
//
// O Resend resolve isso com uma chave só, que é a mesma para o SMTP e para a
// API — e por ser SMTP, entra por baixo do `nodemailer` sem trocar uma linha de
// `enviarRelatorio`. Só a leitura do `.env` mudou.
//
// O QUE MUDA DE VERDADE é o remetente. O Gmail deixava assinar com a própria
// conta; o Resend só deixa assinar de um domínio VERIFICADO por ele. Enquanto
// `cobratecsp.com.br` não fecha o DNS, o único remetente aceito é
// `onboarding@resend.dev` — e é por isso que ele é o padrão aqui em vez de
// `usuario`, que no Resend é a palavra "resend" e não um endereço.
import nodemailer from "nodemailer";

/**
 * Por onde o e-mail sai. Muda a leitura do `.env` e, principalmente, muda o
 * conselho que `explicarErroEmail` dá — "senha de app" e "chave de API" mandam
 * a pessoa para lugares opostos.
 */
export type Provedor = "resend" | "smtp";

export type ConfigEmail = {
  provedor: Provedor;
  host: string;
  porta: number;
  /** 465 fala TLS desde o primeiro byte; 587 sobe para TLS com STARTTLS. */
  seguro: boolean;
  usuario: string;
  senha: string;
  de: string;
  para: string[];
};

/** O que o script manda para a caixa de entrada. */
export type MensagemRelatorio = {
  assunto: string;
  texto: string;
  html: string;
  anexo: { nome: string; conteudo: Buffer } | null;
};

const PORTA_PADRAO = 465;

const RESEND_HOST = "smtp.resend.com";
/** No Resend o usuário é literalmente a palavra "resend"; a chave é a senha. */
const RESEND_USUARIO = "resend";
/**
 * O remetente de cortesia do Resend, que funciona sem domínio verificado.
 *
 * Não é escolha estética: em 28/08/2026 a conta tinha `cobratecsp.com.br`
 * cadastrado com status `failed` (DNS não fechado), e qualquer outro remetente
 * volta com 403 "domain is not verified" — inclusive um Gmail pessoal, que foi
 * o que estava no `.env` e nunca teria saído.
 */
const RESEND_REMETENTE_LIVRE = "onboarding@resend.dev";

/**
 * Endereço plausível — não é validação de RFC, e não quer ser.
 *
 * O que este teste pega é o erro real: `RELATORIO_EMAIL_PARA` com um nome sem
 * arroba, ou com a vírgula sobrando ("a@b.com,"). Endereço sintaticamente
 * perfeito e errado mesmo assim ninguém detecta daqui — para esse caso o
 * conserto é o script dizer PARA ONDE mandou, e não uma expressão regular maior.
 */
function pareceEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Porta válida, ou erro dizendo QUAL variável está errada. */
function lerPorta(bruto: string | undefined, nome: string): number {
  const porta = Number(bruto ?? PORTA_PADRAO);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error(`${nome} inválida: “${bruto}”.`);
  }
  return porta;
}

/**
 * Os destinos do `RELATORIO_EMAIL_PARA`.
 *
 * `padrao` é o que vale quando a variável está vazia — a própria conta, no SMTP.
 * No Resend não existe padrão possível (o usuário é "resend"), e aí `padrao` é
 * `null` e a variável passa a ser obrigatória.
 */
function lerDestinos(bruto: string | undefined, padrao: string | null): string[] {
  const texto = (bruto ?? "").trim();
  if (!texto && padrao === null) {
    throw new Error(
      "RELATORIO_EMAIL_PARA está vazio e o Resend não tem destino padrão " +
        "(o usuário do SMTP é a palavra “resend”, não um endereço). " +
        "Escreva no .env para quem o relatório deve ir.",
    );
  }

  const para = (texto ? texto.split(",") : [padrao as string])
    .map((s) => s.trim())
    .filter(Boolean);
  if (para.length === 0) {
    throw new Error("RELATORIO_EMAIL_PARA está preenchido mas não tem endereço.");
  }
  for (const e of para) {
    if (!pareceEmail(e)) {
      throw new Error(`RELATORIO_EMAIL_PARA tem endereço inválido: “${e}”.`);
    }
  }
  return para;
}

/** O remetente, conferido. Vazio cai no padrão que o provedor aceita. */
function lerRemetente(bruto: string | undefined, padrao: string): string {
  const de = (bruto ?? "").trim() || padrao;
  if (!pareceEmail(de)) {
    throw new Error(`RELATORIO_EMAIL_DE tem endereço inválido: “${de}”.`);
  }
  return de;
}

/**
 * A config de envio, ou `null` quando ninguém ligou e-mail nenhum.
 *
 * `null` e erro são coisas diferentes aqui, e a diferença é deliberada:
 *
 *   • nada configurado → `null`. O comando ainda serve para gerar a planilha no
 *     disco, e é assim que ele roda numa máquina de teste.
 *   • configurado PELA METADE → **erro**. Usuário sem senha é dedo escorregando,
 *     não escolha; tratar isso como "e-mail desligado" faria o relatório sair no
 *     disco todo dia, calado, com a caixa de entrada vazia — que é exatamente o
 *     modo de falhar que esta decisão veio consertar.
 *
 * `API_KEY_RESEND` tem precedência sobre o bloco `SMTP_*` porque é a config mais
 * nova e a que está de pé (decisão 44) — e porque o `.env` guarda as duas: o
 * `SMTP_*` ficou lá, vazio, do tempo do Gmail e da tentativa com o Brevo.
 */
export function configEmail(
  env: Record<string, string | undefined> = process.env,
): ConfigEmail | null {
  const chaveResend = (env.API_KEY_RESEND ?? "").trim();
  if (chaveResend) return configResend(env, chaveResend);
  return configSmtp(env);
}

/**
 * Resend: uma chave só, e o resto tem padrão.
 *
 * Não há caso de "meia configuração" aqui — a chave é a única coisa secreta, e
 * host, porta e usuário são sempre os mesmos. Por isso este caminho não repete
 * a checagem de metade que o SMTP precisa.
 */
function configResend(
  env: Record<string, string | undefined>,
  senha: string,
): ConfigEmail {
  const host = (env.HOST_RESEND ?? "").trim() || RESEND_HOST;
  const porta = lerPorta(env.PORT_RESEND, "PORT_RESEND");
  const usuario = (env.USER_RESEND ?? "").trim() || RESEND_USUARIO;

  return {
    provedor: "resend",
    host,
    porta,
    seguro: porta === 465 || porta === 2465,
    usuario,
    senha,
    // Sem domínio verificado, este é o ÚNICO remetente que o Resend aceita.
    // Deixar `RELATORIO_EMAIL_DE` mandar aqui é de propósito: no dia em que o
    // DNS de cobratecsp.com.br fechar, o conserto é uma linha no .env.
    de: lerRemetente(env.RELATORIO_EMAIL_DE, RESEND_REMETENTE_LIVRE),
    para: lerDestinos(env.RELATORIO_EMAIL_PARA, null),
  };
}

/** O caminho antigo, do Gmail e de qualquer SMTP com usuário e senha. */
function configSmtp(env: Record<string, string | undefined>): ConfigEmail | null {
  const usuario = (env.SMTP_USER ?? "").trim();
  const senha = (env.SMTP_PASSWORD ?? "").trim();

  if (!usuario && !senha) return null;
  if (!usuario || !senha) {
    throw new Error(
      "E-mail configurado pela metade: " +
        `${usuario ? "SMTP_PASSWORD" : "SMTP_USER"} está vazio no .env. ` +
        "Preencha os dois, ou apague os dois para gerar só a planilha.",
    );
  }

  const host = (env.SMTP_HOST ?? "smtp.gmail.com").trim();
  const porta = lerPorta(env.SMTP_PORT, "SMTP_PORT");

  return {
    provedor: "smtp",
    host,
    porta,
    seguro: porta === 465,
    usuario,
    senha,
    // O padrão do destino é a própria conta. É o desenho: o relatório volta para
    // quem o pediu, e quem encaminha ao cliente é gente.
    de: lerRemetente(env.RELATORIO_EMAIL_DE, usuario),
    para: lerDestinos(env.RELATORIO_EMAIL_PARA, usuario),
  };
}

// ────────────────────────── traduzir o erro do SMTP ──────────────────────────
//
// Mesma régua do `explicarErro` do Siscobra (decisão 42): a mensagem crua é
// verdadeira e não diz o que fazer. Aqui a distinção que importa é entre
// "credencial recusada" e "não cheguei no servidor", porque mandam a pessoa para
// lugares opostos — e há um terceiro caso, que é o mais provável de todos na
// primeira vez: a senha da CONTA no lugar da senha de APP.

function codigoDe(e: unknown): string {
  const c = (e as { code?: unknown })?.code;
  return typeof c === "string" ? c : "";
}

function mensagemDe(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" ? m : String(e);
}

/**
 * A frase que vai para o `entrega.erro` do JSON — e daí para os olhos de alguém.
 *
 * `onde` é "smtp.resend.com:465", porque a primeira coisa que se faz com esta
 * frase é conferir host e porta. `provedor` muda o conselho, e essa é a razão de
 * ele existir: "gere uma senha de app" e "confira a chave do Resend" mandam a
 * pessoa para lugares opostos, e um conselho errado custa a manhã dela.
 */
export function explicarErroEmail(
  e: unknown,
  onde: string,
  provedor: Provedor = "smtp",
): string {
  const codigo = codigoDe(e);
  const msg = mensagemDe(e);

  // ─── os dois erros que só o Resend dá ───
  //
  // Vêm ANTES de tudo porque chegam disfarçados: o de domínio costuma vir como
  // recusa de envelope, e o ramo EENVELOPE lá embaixo mandaria conferir o
  // DESTINATÁRIO quando o problema é o REMETENTE. Ninguém acha um erro assim.
  if (/domain is not verified|not verified/i.test(msg)) {
    return (
      `O Resend recusou o REMETENTE: ${msg}. ` +
      "Ele só assina de um domínio verificado por ele — um Gmail pessoal nunca " +
      `passa. Enquanto o DNS do domínio não fechar, deixe RELATORIO_EMAIL_DE ` +
      `vazio no .env (aí vale “${RESEND_REMETENTE_LIVRE}”, que sempre funciona) ` +
      "ou verifique o domínio em resend.com/domains. " +
      "A planilha foi gerada e está no disco."
    );
  }

  if (/only send testing emails|testing emails to your own/i.test(msg)) {
    return (
      `O Resend recusou o DESTINATÁRIO: ${msg}. ` +
      `Com o remetente de cortesia (“${RESEND_REMETENTE_LIVRE}”) só é possível ` +
      "mandar para o e-mail do dono da conta do Resend. Para enviar a outro " +
      "endereço é preciso verificar um domínio em resend.com/domains. " +
      "A planilha foi gerada e está no disco."
    );
  }

  if (
    codigo === "EAUTH" ||
    /invalid login|username and password not accepted|authentication failed|535/i.test(
      msg,
    )
  ) {
    if (provedor === "resend") {
      return (
        `O Resend (${onde}) recusou o login: ${msg}. ` +
        "Confira API_KEY_RESEND no .env — é a chave inteira, começando em “re_”, " +
        "e ela é revogável em resend.com/api-keys. USER_RESEND é a palavra " +
        "“resend”, não um endereço de e-mail. " +
        "A planilha foi gerada e está no disco."
      );
    }
    // O caso número um no Gmail, e a mensagem tem de dizer a palavra "senha de
    // app" ou a pessoa vai passar a tarde redigitando a senha certa da conta
    // errada.
    return (
      `O servidor de e-mail (${onde}) recusou o login: ${msg}. ` +
      "No Gmail com verificação em duas etapas, SMTP_PASSWORD tem de ser uma " +
      "SENHA DE APP (16 letras, gerada em myaccount.google.com/apppasswords) — " +
      "a senha normal da conta é sempre recusada aqui. " +
      "A planilha foi gerada e está no disco."
    );
  }

  if (
    ["ECONNECTION", "ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENOTFOUND", "ESOCKET"].includes(
      codigo,
    ) ||
    /timeout|connect|getaddrinfo/i.test(msg)
  ) {
    const vars =
      provedor === "resend" ? "HOST_RESEND e PORT_RESEND" : "SMTP_HOST e SMTP_PORT";
    return (
      `Não foi possível falar com o servidor de e-mail (${onde}): ${msg}. ` +
      `Confira ${vars}, e se a rede do escritório não bloqueia a ` +
      "porta de saída. A planilha foi gerada e está no disco."
    );
  }

  if (codigo === "EENVELOPE") {
    return (
      `O servidor recusou o destinatário: ${msg}. ` +
      "Confira RELATORIO_EMAIL_PARA no .env. A planilha foi gerada e está no disco."
    );
  }

  // O que não se reconhece sai como veio — diagnóstico inventado manda procurar
  // defeito onde não há.
  return `${msg}. A planilha foi gerada e está no disco.`;
}

/** "smtp.gmail.com:465", para as frases acima. */
export function ondeFicaOSmtp(cfg: ConfigEmail): string {
  return `${cfg.host}:${cfg.porta}`;
}

/**
 * Manda o relatório. Devolve o `messageId` e para onde foi.
 *
 * Não engole erro: quem chama decide o que fazer, e o script transforma isso em
 * `entrega.enviado: false` com a frase traduzida — porque a planilha JÁ está no
 * disco quando esta função roda, e perder o relatório inteiro por causa do
 * e-mail seria trocar um problema pequeno por um grande.
 */
export async function enviarRelatorio(
  cfg: ConfigEmail,
  msg: MensagemRelatorio,
): Promise<{ messageId: string; para: string[] }> {
  const transporte = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.porta,
    secure: cfg.seguro,
    auth: { user: cfg.usuario, pass: cfg.senha },
  });

  const info = await transporte.sendMail({
    from: cfg.de,
    to: cfg.para,
    subject: msg.assunto,
    text: msg.texto,
    html: msg.html,
    attachments: msg.anexo
      ? [
          {
            filename: msg.anexo.nome,
            content: msg.anexo.conteudo,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ]
      : [],
  });

  transporte.close();
  return { messageId: String(info.messageId ?? ""), para: cfg.para };
}
