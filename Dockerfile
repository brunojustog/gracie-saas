# syntax=docker/dockerfile:1.7
# Multi-stage Dockerfile pra Next.js 16 standalone + Prisma 7.

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
# Stage 3: runtime
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl tini && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone usa HOSTNAME pra decidir interface de bind. Docker
# default seta HOSTNAME=<container-id>, que faz o server bindar num
# nome resolvível só dentro do próprio container — wget de fora falha
# com "Connection refused". Forçar 0.0.0.0 pra escutar em todas as
# interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Build standalone do Next: server.js + node_modules trimados.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# SUBSTITUI o node_modules trimmed pelo completo do builder.
# Necessário pro Prisma 7 CLI ter @prisma/config + dependências transitivas
# (effect, etc) em runtime, e pro tsx rodar o seed quando RUN_SEED_ON_BOOT=true.
# Trade-off: imagem ~150 MB maior, mas previne caça a deps transitivas
# que mudam entre versões do Prisma.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Schema Prisma + config (necessários pra `prisma migrate deploy`)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.mjs ./prisma.config.mjs

COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

# tini = init PID 1 que repassa SIGTERM corretamente (Swarm precisa pra
# graceful shutdown). server.js é gerado pelo standalone do Next.
ENTRYPOINT ["/sbin/tini", "--", "/app/entrypoint.sh"]
CMD ["node", "server.js"]
