#!/bin/sh
# Backup consistente do banco SQLite — mesmo com WAL ligado.
#
# Usa `VACUUM INTO`, que gera UM arquivo .db limpo (sem precisar dos auxiliares
# -wal/-shm) e seguro mesmo com o app rodando. Ver decisão 11 em docs/decisoes.md.
#
# Uso:
#   sh scripts/backup-db.sh                 # cria backups/inventario-AAAAMMDD-HHMMSS.db
#   sh scripts/backup-db.sh /caminho/x.db   # destino específico
set -e

DEST="${1:-backups/inventario-$(date +%Y%m%d-%H%M%S).db}"
mkdir -p "$(dirname "$DEST")"

# VACUUM INTO precisa que o destino ainda não exista.
printf "VACUUM INTO '%s';\n" "$DEST" \
  | npx prisma db execute --schema prisma/schema.prisma --stdin

echo "→ Backup criado em: $DEST"
