/**
 * Seed mínimo da fase 1.
 * Cria um super-admin (Bruno) idempotente. O seed completo (tenant Gracie,
 * modalidades, planos, estágios, vendedoras, leads de exemplo) será
 * adicionado na fase 2 quando o schema de domínio estiver pronto.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "bruno@simplificaonline.site";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "gracie-2026";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isSuperAdmin: true },
    create: {
      email,
      name: "Bruno",
      passwordHash,
      isSuperAdmin: true,
      emailVerified: new Date(),
    },
  });

  console.log(`✓ Super-admin pronto: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
