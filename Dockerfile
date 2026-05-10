# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile pra Next.js 16 standalone + Prisma 7.
# Resultado: imagem ~250 MB (node 22-alpine + .next/standalone + prisma engine).

ARG NODE_VERSION=22-alpine

# ──────────────────────────────────────────────────────────────────────────
# Stage 1: deps — instala node_modules (com cache de layer)
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Necessário pro Prisma compilar query engine
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `npm ci` honra exact versions do lockfile e roda `postinstall` (prisma generate)
RUN npm ci --include=dev

# ──────────────────────────────────────────────────────────────────────────
# Stage 2: builder — compila Next + gera Prisma Client
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Sem ENVs de runtime aqui — Next 16 não precisa em build time pra páginas
# server-rendered. As envs vêm via stack.yml em runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ──────────────────────────────────────────────────────────────────────────
# Stage 3: runtime — imagem final mínima
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma precisa do query engine + binário SSL configurado pro Alpine
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Copia build standalone (já inclui node_modules trimados pelo Next)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma client + engine binário (standalone NÃO copia automaticamente)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.mjs ./prisma.config.mjs

# tsx pra rodar prisma migrate deploy + seed se necessário (Prisma 7 + ESM
# config exige um runtime TS). Via npx temporário no entrypoint.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

# tini = init PID 1 que repassa SIGTERM corretamente (Swarm precisa pra
# graceful shutdown). server.js é gerado pelo standalone do Next.
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
