#!/bin/sh
# Backup consistente do banco SQLite — mesmo com WAL ligado.
#
# Usa `VACUUM INTO`, que gera UM arquivo .db limpo (sem precisar dos auxiliares
# -wal/-shm) e seguro mesmo com o app rodando. Ver decisão 11 em docs/decisoes.md.
#
# Uso:
#   sh scripts/backup-db.sh                 # cria backups/inventario-AAAAMMDD-HHMMSS.db
#   sh scripts/backup-db.sh /caminho/x.db   # destino específico
#
# Rotação: apaga backups com mais de BACKUP_DIAS dias (padrão 30). Sem isso, o
# agendamento diário enche o disco em silêncio — e disco cheio derruba o app
# junto. A limpeza roda DEPOIS do backup novo dar certo: se o backup falhar, é
# melhor ficar com cópias velhas do que sem nenhuma.
#
# Para agendar (cron/systemd), veja docs/backup.md.
set -e

DIAS="${BACKUP_DIAS:-30}"
DEST="${1:-backups/inventario-$(date +%Y%m%d-%H%M%S).db}"
PASTA="$(dirname "$DEST")"
mkdir -p "$PASTA"

# VACUUM INTO precisa que o destino ainda não exista.
printf "VACUUM INTO '%s';\n" "$DEST" \
  | npx prisma db execute --schema prisma/schema.prisma --stdin

# Um backup de 0 byte é pior do que nenhum: passa despercebido até o dia do
# desastre. Confere antes de deixar a rotação apagar os antigos.
if [ ! -s "$DEST" ]; then
  echo "ERRO: backup vazio em $DEST — nada foi apagado." >&2
  exit 1
fi

echo "→ Backup criado em: $DEST ($(du -h "$DEST" | cut -f1))"

# Só remove o que este script gera, pelo padrão do nome — nunca varre a pasta
# inteira, que pode ter cópias que alguém colocou ali de propósito.
APAGADOS=$(find "$PASTA" -maxdepth 1 -name 'inventario-*.db' -type f -mtime "+$DIAS" -print -delete | wc -l)
if [ "$APAGADOS" -gt 0 ]; then
  echo "→ Rotação: $APAGADOS backup(s) com mais de $DIAS dias removido(s)."
fi
