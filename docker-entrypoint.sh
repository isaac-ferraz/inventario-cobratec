#!/bin/sh
set -e

# Aplica as migrations no banco SQLite (no volume) antes de subir o servidor.
echo "→ Aplicando migrations (prisma migrate deploy)..."
node ./node_modules/prisma/build/index.js migrate deploy

echo "→ Iniciando Next.js (standalone) em ${HOSTNAME}:${PORT}..."
exec node server.js
