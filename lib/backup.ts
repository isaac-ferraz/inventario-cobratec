// O backup que roda sozinho.
//
// ────────────────────── por que isto existe em TypeScript ──────────────────────
//
// `scripts/backup-db.sh` faz a mesma coisa desde a decisão 11, e nunca rodou uma
// vez sequer sem alguém digitar. A decisão 37 nomeou o motivo: agendar dependia
// de escolher a máquina, e a máquina nunca foi escolhida. O script tem cron e
// unit de systemd escritos em `docs/backup.md` — e o backup do escritório hoje é
// o que alguém lembrou de rodar.
//
// A saída é a mesma da decisão 37: o que sobe junto com o container funciona no
// dia em que o container subir em qualquer lugar. Então o backup virou tarefa do
// relógio, ao lado da purga.
//
// O script continua valendo e não foi tocado: ele é o caminho de quem quer uma
// cópia AGORA, com destino escolhido na hora (`sh scripts/backup-db.sh /mnt/nas/x.db`),
// e é o único que funciona com o app parado. As duas implementações não
// divergem em regra nenhuma — o que elas compartilham é `VACUUM INTO`, que é do
// SQLite, não nosso.
//
// ───────────────────────────── o que não muda ─────────────────────────────
//
// Backup na mesma máquina do banco não protege contra o cenário mais comum, que
// é a máquina morrer. Isto aqui garante que a cópia EXISTE e é recente; levá-la
// para fora continua sendo trabalho de quem administra o host (`BACKUP_DIR`
// apontando para um NAS montado resolve, e é o que `docs/backup.md` recomenda).
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { FUSO_BRASIL } from "@/lib/relatorios";

/** Nome que o script gera desde sempre — a rotação casa por ele. */
const PADRAO = /^inventario-\d{8}-\d{6}\.db$/;

const DIAS_PADRAO = 30;

/**
 * Onde as cópias ficam.
 *
 * O padrão é `data/backups` e não `backups/` (que é o do script) por um motivo
 * só: no container, `data/` é o volume. `backups/` na raiz do app mora dentro da
 * imagem e some no próximo `--build` — um backup que evapora no deploy é pior
 * que nenhum, porque parece que existe. Mesma escolha de `pastaDeMidia()`.
 */
export function pastaDeBackup(): string {
  return (
    process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), "data", "backups")
  );
}

/**
 * Quantos dias de cópia guardar.
 *
 * Piso de 1: `BACKUP_DIAS=0` apagaria o backup recém-criado no mesmo minuto —
 * o mesmo dedo escorregando no `.env` que a retenção freia com o piso de 30.
 */
export function diasDeRetencao(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number.parseInt(env.BACKUP_DIAS ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : DIAS_PADRAO;
}

/** `inventario-AAAAMMDD-HHMMSS.db`, no fuso do Brasil. */
export function nomeDoBackup(agora: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const de = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  const hora = String(Number(de("hour")) % 24).padStart(2, "0");
  return `inventario-${de("year")}${de("month")}${de("day")}-${hora}${de("minute")}${de("second")}.db`;
}

/**
 * Quais cópias a rotação leva.
 *
 * Pura porque é a única parte com como errar em silêncio, e errar aqui é apagar
 * backup. Só casa o que este código gera: a pasta pode ter cópia que alguém
 * colocou ali de propósito, e varrer a pasta inteira levaria justamente a cópia
 * que foi guardada à mão porque importava.
 */
export function paraApagar(
  arquivos: { nome: string; modificadoEm: Date }[],
  agora: Date,
  dias: number,
): string[] {
  const limite = agora.getTime() - dias * 86_400_000;
  return arquivos
    .filter((a) => PADRAO.test(a.nome) && a.modificadoEm.getTime() < limite)
    .map((a) => a.nome);
}

/**
 * Faz a cópia, confere e roda a rotação. Devolve o detalhe da tarefa.
 *
 * Lança em caso de falha, de propósito: `executar()` grava "erro" em
 * `TarefaAgendada`, e o chamador transforma isso em aviso. Backup que falha
 * calado é o defeito que a decisão 37 nomeou.
 */
export async function fazerBackup(agora: Date = new Date()): Promise<string> {
  const pasta = pastaDeBackup();
  await fs.mkdir(pasta, { recursive: true });

  const destino = path.join(pasta, nomeDoBackup(agora));
  // `VACUUM INTO` exige que o destino não exista. Dois backups no mesmo segundo
  // só acontecem se alguém mandar rodar duas vezes na mão — e aí a mensagem
  // certa é essa, não um arquivo sobrescrito.
  try {
    await fs.access(destino);
    throw new Error(`já existe uma cópia em ${destino}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  // Aspas simples dobradas: o caminho vem do ambiente, não do usuário, mas o
  // custo de escapar é uma linha e o de não escapar é SQL quebrado num caminho
  // com apóstrofo, às 22h, sem ninguém olhando.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);

  // Um backup de 0 byte passa despercebido até o dia do desastre. Confere ANTES
  // de deixar a rotação apagar os antigos: se a cópia nova não presta, é melhor
  // ficar com as velhas do que sem nenhuma.
  const { size } = await fs.stat(destino);
  if (size === 0) {
    await fs.rm(destino, { force: true });
    throw new Error("a cópia saiu vazia — nada foi apagado");
  }

  const dias = diasDeRetencao();
  const nomes = await fs.readdir(pasta);
  const velhos: { nome: string; modificadoEm: Date }[] = [];
  for (const nome of nomes) {
    if (!PADRAO.test(nome)) continue;
    const s = await fs.stat(path.join(pasta, nome));
    velhos.push({ nome, modificadoEm: s.mtime });
  }

  let apagados = 0;
  for (const nome of paraApagar(velhos, agora, dias)) {
    // Um arquivo que não sai não pode derrubar um backup que deu certo.
    try {
      await fs.rm(path.join(pasta, nome));
      apagados++;
    } catch (e) {
      console.error("[backup] não apagou", nome, (e as Error).message);
    }
  }

  const mb = (size / 1_048_576).toFixed(1);
  return (
    `cópia de ${mb} MB em ${destino}` +
    (apagados > 0 ? ` · rotação: ${apagados} com mais de ${dias} dias` : "")
  );
}
