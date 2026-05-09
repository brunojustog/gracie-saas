import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 mudou: a `url` do datasource saiu do schema.prisma e agora é
 * configurada aqui. O PrismaClient (em src/lib/prisma.ts) precisa receber
 * um adapter explícito (@prisma/adapter-pg).
 *
 * Docs: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
