/**
 * Seed da estrutura inicial de produtos da lojinha BGAF (v1.1-I).
 *
 * Cria os 30 produtos da lista do Bruno com variantes adequadas. Preço e
 * estoque ficam zerados/nulos — admin preenche em /pdv/produtos.
 *
 * Idempotente — re-run só cria o que falta (chave: Product.name+tenant).
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { type ProductCategory, PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Spec = {
  name: string;
  category: ProductCategory;
  /** Labels das variantes. Default = ["Padrão"]. */
  variants?: string[];
};

const TAMANHOS_VESTUARIO = ["P", "M", "G", "GG"];
const TAMANHOS_KIMONO_GB = ["A1", "A2", "A3", "A4"];
const TAMANHOS_FAIXA = ["A0", "A1", "A2", "A3", "A4", "A5"];

const PRODUCTS: Spec[] = [
  // ── Bebidas ────────────────────────────────────────────────────────────
  { name: "Água", category: "BEBIDA" },
  { name: "Água com gás", category: "BEBIDA" },
  { name: "Água de coco", category: "BEBIDA" },
  { name: "Gatorade", category: "BEBIDA" },
  { name: "Youpro", category: "BEBIDA" },
  { name: "RedBull", category: "BEBIDA" },

  // ── Suplementos / Snacks ──────────────────────────────────────────────
  { name: "Paçoca Bentu", category: "SUPLEMENTO" },
  { name: "Bold Tubs", category: "SUPLEMENTO" },
  { name: "Hitt Nuts", category: "SUPLEMENTO" },
  { name: "Bala Fini Zero Açúcar", category: "SUPLEMENTO" },
  { name: "Liquidz", category: "SUPLEMENTO" },
  { name: "Sublime Bentu", category: "SUPLEMENTO" },
  { name: "Bold Whey Mousse", category: "SUPLEMENTO" },
  { name: "Go Recovery Gel", category: "SUPLEMENTO" },
  { name: "BT 400 NIT", category: "SUPLEMENTO" },

  // ── Faixas ────────────────────────────────────────────────────────────
  { name: "Faixa branca", category: "FAIXA", variants: TAMANHOS_FAIXA },

  // ── Kimonos ───────────────────────────────────────────────────────────
  { name: "Kimono Atleta Azul", category: "KIMONO", variants: TAMANHOS_KIMONO_GB },
  { name: "Kimono Lutador Azul", category: "KIMONO", variants: TAMANHOS_KIMONO_GB },
  { name: "Kimono Branco GB1", category: "KIMONO", variants: TAMANHOS_KIMONO_GB },
  { name: "Kimono Branco GBK", category: "KIMONO", variants: ["M0", "M1", "M2", "M3"] },
  { name: "Kimono Rosa Infantil", category: "KIMONO", variants: ["M0", "M1", "M2", "M3"] },
  { name: "Kimono Azul Infantil", category: "KIMONO", variants: ["M0", "M1", "M2", "M3"] },

  // ── Camisetas / Rashguards ────────────────────────────────────────────
  { name: "Camiseta Training Infantil", category: "CAMISETA", variants: ["P", "M", "G"] },
  { name: "Camiseta Training Adulto", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },
  { name: "Rashguard Training", category: "RASHGUARD", variants: TAMANHOS_VESTUARIO },
  { name: "Rashguard Training Lutador", category: "RASHGUARD", variants: TAMANHOS_VESTUARIO },
  { name: "Rashguard Training Sakura", category: "RASHGUARD", variants: TAMANHOS_VESTUARIO },
  { name: "Regata Canelada Legacy Branca", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },
  { name: "Camiseta Legacy Shadow Infantil Cinza", category: "CAMISETA", variants: ["P", "M", "G"] },
  { name: "Camiseta Arte Suave V2 Feminina", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },
  { name: "Camiseta Tactical Adulto Preta", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },
  { name: "Camiseta Barrinha Infantil", category: "CAMISETA", variants: ["P", "M", "G"] },
  { name: "Camisa Competition Red", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },
  { name: "Camiseta GB Lutador", category: "CAMISETA", variants: TAMANHOS_VESTUARIO },

  // ── Bermudas / Shorts ─────────────────────────────────────────────────
  { name: "Bermuda No Gi sem Velcro", category: "BERMUDA_SHORT", variants: TAMANHOS_VESTUARIO },
  { name: "Short de Treino Sakura", category: "BERMUDA_SHORT", variants: TAMANHOS_VESTUARIO },
  { name: "Rashguard Feminina Sakura V3", category: "RASHGUARD", variants: TAMANHOS_VESTUARIO },

  // ── Acessórios ────────────────────────────────────────────────────────
  { name: "Chinelo Slide Legacy GB", category: "ACESSORIO", variants: ["38", "40", "42", "44"] },
  { name: "Strap Rosa", category: "ACESSORIO" },
  { name: "Strap Preto", category: "ACESSORIO" },
  { name: "Mochila Barrinha Infantil Azul", category: "ACESSORIO" },
  { name: "Mochila RS Preta e Cinza", category: "ACESSORIO" },
  { name: "Mochila Red Comp GB4", category: "ACESSORIO" },
  { name: "Garrafa Térmica Lutador 960ml Azul", category: "ACESSORIO" },
  { name: "Garrafa Térmica Barrinha Preta", category: "ACESSORIO" },
  { name: "Garrafa Térmica RSC BJJ 660ml Branca", category: "ACESSORIO" },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "gracie" } });
  if (!tenant) throw new Error("tenant não existe — rode `npm run db:seed`.");

  let created = 0;
  let skipped = 0;
  let variantsCreated = 0;

  for (const spec of PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: tenant.id, name: spec.name },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const labels = spec.variants ?? ["Padrão"];
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: spec.name,
        category: spec.category,
        variants: {
          create: labels.map((label) => ({
            label,
            price: 0,
            stock: null,
            active: true,
          })),
        },
      },
    });
    created++;
    variantsCreated += labels.length;
    console.log(`  + ${product.name} (${labels.length} variant${labels.length > 1 ? "s" : ""})`);
  }

  console.log(
    `\n✓ Produtos: ${created} criados, ${skipped} já existiam. Variantes novas: ${variantsCreated}.`,
  );
  console.log(`  Preço e estoque ficam zerados — preencha em /pdv/produtos.\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
