# syntax=docker/dockerfile:1

# ---- deps: instala dependências ----
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: gera o Prisma Client e o build standalone ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
# DATABASE_URL fictício só para o build (as páginas são dinâmicas, não tocam o banco).
ENV DATABASE_URL="file:/tmp/build.db"
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: imagem final enxuta ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Caminho ABSOLUTO do banco no volume (evita ambiguidade de path relativo).
ENV DATABASE_URL="file:/app/data/dev.db"

# Usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# Servidor standalone do Next (inclui um node_modules mínimo já tracejado)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma para rodar `migrate deploy` no start: schema, migrations, CLI e o
# escopo @prisma completo (a CLI precisa de @prisma/debug, get-platform, etc.).
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Diretório persistente do banco (montado como volume) + permissões
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
