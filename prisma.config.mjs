import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 mudou: a `url` do datasource saiu do schema.prisma e agora é
 * configurada aqui. O PrismaClient (em src/lib/prisma.ts) precisa receber
 * um adapter explícito (@prisma/adapter-pg).
 *
 * Usamos `.mjs` em vez de `.ts` pra evitar precisar de loader TypeScript
 * (tsx, esbuild) em runtime no container Docker — ECMAScript Module puro
 * roda em qualquer Node.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
