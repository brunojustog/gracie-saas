#!/bin/sh
# Entrypoint do container em produção.
# Roda migrations Prisma antes de subir o Next. Em Swarm com 1 réplica
# isso é seguro — múltiplas réplicas exigiriam orquestração externa
# (pre-deploy job).
set -e

echo "→ [entrypoint] Aplicando migrations Prisma..."
npx --no-install prisma migrate deploy

if [ "${RUN_SEED_ON_BOOT:-false}" = "true" ]; then
  echo "→ [entrypoint] Rodando seed (RUN_SEED_ON_BOOT=true)..."
  npx --no-install tsx prisma/seed.ts
fi

echo "→ [entrypoint] Iniciando Next.js server na porta 3000..."
exec "$@"
