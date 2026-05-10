#!/bin/sh
# Entrypoint do container em produção.
# Roda migrations Prisma antes de subir o Next. Em Swarm com 1 réplica
# isso é seguro — múltiplas réplicas exigiriam orquestração externa
# (pre-deploy job).
#
# Chamamos `node` diretamente nos JS dos pacotes (em vez de `npx`)
# porque o build standalone do Next não inclui `node_modules/.bin/`,
# então `npx` não acharia os binários.
set -e

PRISMA_CLI=/app/node_modules/prisma/build/index.js
TSX_CLI=/app/node_modules/tsx/dist/cli.mjs

echo "→ [entrypoint] Aplicando migrations Prisma..."
node "$PRISMA_CLI" migrate deploy

if [ "${RUN_SEED_ON_BOOT:-false}" = "true" ]; then
  echo "→ [entrypoint] Rodando seed (RUN_SEED_ON_BOOT=true)..."
  node "$TSX_CLI" prisma/seed.ts
fi

echo "→ [entrypoint] Iniciando Next.js server na porta 3000..."
exec "$@"
