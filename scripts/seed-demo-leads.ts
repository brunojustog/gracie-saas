/**
 * Cria leads de exemplo no tenant Gracie pra testar o kanban com volume real.
 *
 * Idempotente — se rodar 2x, atualiza em vez de duplicar (busca por
 * `name` dentro do tenant). Pra reset total: `npm run db:reset && npm run db:seed && npm run db:demo-leads`.
 *
 * Distribuição:
 *   - 5 leads em Novo Lead (recém chegados via webhook simulado)
 *   - 4 em Contatado
 *   - 3 em Agendado
 *   - 2 em Confirmado
 *   - 2 em Compareceu
 *   - 2 em Negociação
 *   - 1 em Matriculado (será um Enrollment quando a fase 9 chegar)
 *   - 1 em Não Fechou
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Lead,
  type LeadOrigin,
  type Modality,
  type Stage,
  type User,
} from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type DemoLead = {
  name: string;
  phone: string;
  email?: string;
  origin: LeadOrigin;
  modalityName?: string;
  /** Nome do stage (8 do playbook v1.1) */
  stageName: string;
  /** Tags acumulativas. Ex: "Contatado", "Confirmado", "Remarcou", "VISITANTE GB" */
  tags?: string[];
  /** Email da vendedora atribuída (deixar undefined pra ficar não-atribuído) */
  sellerEmail?: string;
  /** Dias atrás de lastInteractionAt — controla o indicador de "frio" */
  daysAgo: number;
};

const DEMO: DemoLead[] = [
  // Novo Lead — sem resposta ainda (5)
  { name: "Maria Silva", phone: "+5511987654321", origin: "WHATSAPP", modalityName: "GB1", stageName: "Novo Lead", daysAgo: 0 },
  { name: "João Pereira", phone: "+5511912345678", origin: "WHATSAPP", stageName: "Novo Lead", daysAgo: 0 },
  { name: "Letícia Sousa", phone: "+5511933334444", origin: "INSTAGRAM_DIRECT", modalityName: "GBF", stageName: "Novo Lead", daysAgo: 1 },
  { name: "Bruno Carvalho", phone: "+5511955557777", email: "bruno.carvalho@gmail.com", origin: "WEBSITE", modalityName: "GB1", stageName: "Novo Lead", daysAgo: 1 },
  { name: "Família Tanaka (filho 6 anos)", phone: "+5511988883333", origin: "REFERRAL", modalityName: "GBK - Pequenos Campeões 1", stageName: "Novo Lead", daysAgo: 2 },

  // Novo Lead com tag "Contatado" — atendente já mandou mensagem mas sem resposta (4)
  { name: "Lucas Almeida", phone: "+5511944442222", origin: "WHATSAPP", modalityName: "GB1", stageName: "Novo Lead", tags: ["Contatado"], sellerEmail: "anna@gracie.com", daysAgo: 1 },
  { name: "Camila Rocha", phone: "+5511922221111", origin: "INSTAGRAM_DIRECT", modalityName: "BarraFit", stageName: "Novo Lead", tags: ["Contatado"], sellerEmail: "evelyn@gracie.com", daysAgo: 2 },
  { name: "Roberto Lima", phone: "+5511933332222", origin: "FACEBOOK", modalityName: "GB2", stageName: "Novo Lead", tags: ["Contatado"], sellerEmail: "rafaela@gracie.com", daysAgo: 3 },
  { name: "Fernanda Costa", phone: "+5511955554444", origin: "GOOGLE_ADS", modalityName: "GBF", stageName: "Novo Lead", tags: ["Contatado"], sellerEmail: "anna@gracie.com", daysAgo: 4 },

  // Potencial — respondeu, demonstrou interesse, ainda não agendou (2)
  { name: "Diego Martins", phone: "+5511966666666", origin: "WHATSAPP", modalityName: "GB1", stageName: "Potencial", sellerEmail: "anna@gracie.com", daysAgo: 0 },
  { name: "Patrícia Nunes", phone: "+5511977777777", origin: "WHATSAPP", modalityName: "GBF", stageName: "Potencial", sellerEmail: "evelyn@gracie.com", daysAgo: 1 },

  // Agendamento — visita marcada (3)
  { name: "Henrique Souza", phone: "+5511988888888", origin: "WALK_IN", modalityName: "GB2", stageName: "Agendamento", sellerEmail: "rafaela@gracie.com", daysAgo: 2 },
  { name: "Aline Ferreira", phone: "+5511911112222", origin: "WHATSAPP", modalityName: "BarraFit", stageName: "Agendamento", tags: ["Confirmado"], sellerEmail: "evelyn@gracie.com", daysAgo: 0 },
  { name: "Família Oliveira (filha 11 anos)", phone: "+5511922223333", origin: "REFERRAL", modalityName: "GBK - Juniors", stageName: "Agendamento", tags: ["Confirmado"], sellerEmail: "rafaela@gracie.com", daysAgo: 1 },

  // Comparecimento (2)
  { name: "Rodrigo Castro", phone: "+5511933334444", origin: "WHATSAPP", modalityName: "GB1", stageName: "Comparecimento", sellerEmail: "anna@gracie.com", daysAgo: 0 },
  { name: "Juliana Pires", phone: "+5511944445555", origin: "INSTAGRAM_DIRECT", modalityName: "GBF", stageName: "Comparecimento", sellerEmail: "evelyn@gracie.com", daysAgo: 1 },

  // Negociação (2)
  { name: "Marcelo Andrade", phone: "+5511955556666", origin: "REFERRAL", modalityName: "GB1", stageName: "Negociação", sellerEmail: "rafaela@gracie.com", daysAgo: 2 },
  { name: "Família Vieira (2 filhos)", phone: "+5511966667777", origin: "WALK_IN", modalityName: "GBK - Pequenos Campeões 2", stageName: "Negociação", sellerEmail: "anna@gracie.com", daysAgo: 5 },

  // Ganho (1) — vai virar Enrollment via db:demo-enrollments
  { name: "Thiago Mendes", phone: "+5511977778888", origin: "WHATSAPP", modalityName: "GB1", stageName: "Ganho", sellerEmail: "evelyn@gracie.com", daysAgo: 7 },

  // Perda — fechou em outro lugar / não tinha interesse (1)
  { name: "Sandra Ribeiro", phone: "+5511988889999", origin: "WHATSAPP", modalityName: "GBF", stageName: "Perda", tags: ["Não Fechou"], sellerEmail: "rafaela@gracie.com", daysAgo: 10 },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "gracie" } });
  if (!tenant) throw new Error("tenant 'gracie' não existe — rode `npm run db:seed` antes.");

  const [stages, modalities, sellers] = await Promise.all([
    prisma.stage.findMany({ where: { tenantId: tenant.id } }),
    prisma.modality.findMany({ where: { tenantId: tenant.id } }),
    prisma.user.findMany({
      where: { tenants: { some: { tenantId: tenant.id, role: "SELLER" } } },
    }),
  ]);

  const stageByName = new Map<string, Stage>(stages.map((s) => [s.name, s]));
  const modalityByName = new Map<string, Modality>(modalities.map((m) => [m.name, m]));
  const sellerByEmail = new Map<string, User>(sellers.map((u) => [u.email, u]));

  let created = 0;
  let updated = 0;

  for (const d of DEMO) {
    const stage = stageByName.get(d.stageName);
    if (!stage) {
      console.warn(`  · pulando ${d.name}: stage "${d.stageName}" não existe`);
      continue;
    }
    const modality = d.modalityName ? modalityByName.get(d.modalityName) : null;
    const seller = d.sellerEmail ? sellerByEmail.get(d.sellerEmail) : null;
    const lastInteractionAt = new Date(Date.now() - d.daysAgo * 24 * 60 * 60 * 1000);

    const existing = await prisma.lead.findFirst({
      where: { tenantId: tenant.id, name: d.name },
    });

    const data = {
      phone: d.phone,
      email: d.email ?? null,
      origin: d.origin,
      stageId: stage.id,
      modalityId: modality?.id ?? null,
      assignedSellerId: seller?.id ?? null,
      tags: d.tags ?? [],
      lastInteractionAt,
    } satisfies Partial<Lead>;

    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.lead.create({
        data: {
          tenantId: tenant.id,
          name: d.name,
          firstInteractionAt: lastInteractionAt,
          ...data,
        },
      });
      created++;
    }
  }

  console.log(`✓ Demo leads: ${created} criados, ${updated} atualizados (total alvo: ${DEMO.length})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
