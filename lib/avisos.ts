// Os avisos que o sistema produz sozinho.
//
// ─────────────────────────── grava antes de enviar ───────────────────────────
//
// A ordem não é detalhe de implementação — é a decisão inteira. O canal de
// saída é o mesmo gateway não-oficial de WhatsApp da decisão 29, que pode estar
// fora do ar, com a sessão caída ou com o chip banido. Se o aviso só existisse
// na mensagem, o dia em que o canal falhasse seria justamente o dia em que
// ninguém ficaria sabendo de nada — e a falha do canal é uma das coisas que o
// vigia precisa avisar.
//
// Então: grava, e só depois tenta empurrar. Falhar no empurrão vira uma coluna
// (`entrega`), não um aviso perdido. É o inverso do `/chat`, onde a regra é
// entregar primeiro (mensagem fantasma para o devedor é pior que repetida) —
// aqui o destinatário é interno e a tela é o registro que vale.
//
// ─────────────────────────────── deduplicação ───────────────────────────────
//
// Todo aviso tem `chave` UNIQUE, montada com o assunto e o dia. A mesma tarefa
// roda duas vezes com facilidade (retry, restart do container, alguém clicando
// "rodar agora"), e o mesmo aviso repetido na tela é o começo de as pessoas
// pararem de ler a tela.
import { prisma } from "@/lib/prisma";
import { enviarPeloGateway } from "@/lib/chat-envio";

export type NivelAviso = "info" | "alerta" | "grave";
export type TipoAviso = "carteira" | "integracao" | "backup" | "purga";

export type NovoAviso = {
  tipo: TipoAviso;
  nivel?: NivelAviso;
  titulo: string;
  corpo: string;
  link?: string | null;
  /** Sem o dia dentro, o aviso de amanhã seria engolido como duplicata. */
  chave: string;
  /**
   * Força (ou impede) o empurrão, contra o padrão do nível.
   *
   * O digest usa isto: ele é `info` — não exige ação, não é problema — e ainda
   * assim precisa chegar ao celular, porque o valor dele é justamente não
   * depender de alguém abrir a tela.
   */
  empurrar?: boolean;
};

/**
 * Para quem o WhatsApp vai.
 *
 * Lista em variável de ambiente e não em tabela: são dois ou três celulares do
 * TI e da gerência, mudam uma vez por ano, e uma tela de cadastro para isso
 * seria mais código do que o problema tem.
 */
export function destinatarios(): string[] {
  return (process.env.AVISOS_WHATSAPP ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter((n) => n.length >= 10);
}

/**
 * Quais níveis saem no WhatsApp.
 *
 * `info` fica só na tela de propósito. Um resumo diário que chega todo dia às
 * 12h vira notificação ignorada em duas semanas, e aí o alerta grave chega no
 * mesmo balde do ruído. O celular é para o que exige ação.
 */
function empurra(a: NovoAviso, nivel: NivelAviso): boolean {
  return a.empurrar ?? (nivel === "alerta" || nivel === "grave");
}

const PREFIXO: Record<NivelAviso, string> = {
  info: "ℹ️",
  alerta: "⚠️",
  grave: "🔴",
};

/**
 * Grava o aviso e (se for o caso) empurra.
 *
 * Devolve `null` quando a chave já existia — o chamador usa isso para saber que
 * não precisa fazer mais nada. Nunca lança: um aviso que derruba a tarefa que o
 * gerou transforma um problema pequeno em dois.
 */
export async function registrarAviso(a: NovoAviso): Promise<string | null> {
  const nivel = a.nivel ?? "info";
  let id: string;
  try {
    const criado = await prisma.aviso.create({
      data: {
        tipo: a.tipo,
        nivel,
        titulo: a.titulo,
        corpo: a.corpo,
        link: a.link ?? null,
        chave: a.chave,
      },
      select: { id: true },
    });
    id = criado.id;
  } catch (e) {
    // P2002 é a chave repetida, e é sucesso: o aviso já está lá.
    if ((e as { code?: string })?.code === "P2002") return null;
    console.error("[avisos] falha ao gravar:", (e as Error).message);
    return null;
  }

  if (!empurra(a, nivel)) return id;

  const numeros = destinatarios();
  if (numeros.length === 0) {
    await marcarEntrega(id, "sem destinatário configurado (AVISOS_WHATSAPP)");
    return id;
  }

  const texto = `${PREFIXO[nivel]} *${a.titulo}*\n\n${a.corpo}`;
  const falhas: string[] = [];
  for (const numero of numeros) {
    const r = await enviarPeloGateway(numero, texto);
    if (!r.ok) falhas.push(`${numero}: ${r.motivo}`);
  }
  await marcarEntrega(
    id,
    falhas.length === 0
      ? "ok"
      : falhas.length === numeros.length
        ? `falhou — ${falhas[0]}`
        : `parcial — ${falhas.join("; ")}`,
  );
  return id;
}

async function marcarEntrega(id: string, entrega: string) {
  try {
    await prisma.aviso.update({ where: { id }, data: { entrega } });
  } catch {
    // O aviso já está gravado; não saber o resultado do envio é o menor dos
    // problemas possíveis aqui.
  }
}

/** Quantos avisos ainda não foram vistos — o contador da navegação. */
export async function pendentes(): Promise<number> {
  return prisma.aviso.count({ where: { lidoEm: null } });
}
