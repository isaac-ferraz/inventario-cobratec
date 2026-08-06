#!/bin/sh
set -e

# Aplica as migrations no banco SQLite (no volume) antes de subir o servidor.
echo "→ Aplicando migrations (prisma migrate deploy)..."
node ./node_modules/prisma/build/index.js migrate deploy

# Ativa o modo WAL (melhora concorrência leitura/escrita). Idempotente.
echo "→ Garantindo modo WAL do SQLite..."
node ./node_modules/prisma/build/index.js db execute \
  --schema ./prisma/schema.prisma --file ./prisma/sqlite-wal.sql || true

# Garante o catálogo padrão de tipos de componente (idempotente).
node ./prisma/seed-catalogo.cjs

# Garante as salas iniciais do escritório (idempotente).
node ./prisma/seed-salas.cjs

# Garante que exista um administrador para o primeiro acesso (idempotente).
node ./prisma/seed-admin.cjs

# Sem AUTH_SECRET não há como assinar sessão — falhar aqui é melhor do que
# subir um app onde ninguém consegue entrar (ou pior, com segredo previsível).
if [ -z "${AUTH_SECRET}" ]; then
  echo "ERRO: AUTH_SECRET não definido. Defina-o no .env / no compose (mínimo 16 caracteres)." >&2
  exit 1
fi

echo "→ Iniciando Next.js (standalone) em ${HOSTNAME}:${PORT}..."
exec node server.js
