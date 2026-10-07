/**
 * Camada de dados de aulas particulares (v1.1-AO).
 *
 * Pacote = compra avulsa de N aulas por um aluno NÃO-mensalista. NUNCA vira
 * Enrollment (não infla a contagem de matriculados). Visibilidade segue
 * v1.1-O: qualquer role do tenant vê todos.
 */
import type { PrivatePackageStatus, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";

/** Sessões concluídas (com completedAt) de um conjunto de sessões. */
export function countCompleted(
  sessions: Array<{ completedAt: Date | null }>,
): number {
  return sessions.filter((s) => s.completedAt !== null).length;
}

/**
 * Status derivado pós-mudança de sessões: COMPLETED quando concluídas >=
 * contratadas; senão mantém o status atual (ACTIVE/CANCELED não muda aqui).
 * Cancelamento é explícito (ação própria), nunca automático.
 */
export function deriveStatus(
  current: PrivatePackageStatus,
  completed: number,
  total: number,
): PrivatePackageStatus {
  if (current === "CANCELED") return "CANCELED";
  return completed >= total ? "COMPLETED" : "ACTIVE";
}

/**
 * v1.2-BV: gera automaticamente o ciclo de recorrência dos pacotes particulares.
 * Rodado uma vez por dia (cron diário). Para cada pacote recorrente cujo
 * `recurringDay` cai hoje (fuso BR; dia 31 cai no último dia do mês), cria uma
 * renovação de `recurringClasses` aulas — se ainda não gerou neste mês
 * (idempotência via `lastRecurrenceAt`). Corrige a falha de não gerar sozinho.
 */
export async function runPrivateRecurrence(
  now: Date = new Date(),
): Promise<{ generated: number; skipped: number }> {
  const y = now.getFullYear();
  const m = now.getMonth();
  const dom = now.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthStart = new Date(y, m, 1);
  const nextMonthStart = new Date(y, m + 1, 1);

  const pkgs = await prisma.privatePackage.findMany({
    where: { recurring: true, recurringDay: { not: null }, status: { not: "CANCELED" } },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      recurringDay: true,
      recurringClasses: true,
      totalClasses: true,
      status: true,
      lastRecurrenceAt: true,
      sessions: { select: { completedAt: true } },
      // v1.2-BZ: renovações do mês (manual OU auto) pra não duplicar o ciclo.
      renewals: {
        where: { paidAt: { gte: monthStart, lt: nextMonthStart } },
        select: { id: true },
        take: 1,
      },
    },
  });

  let generated = 0;
  let skipped = 0;
  for (const p of pkgs) {
    const add = p.recurringClasses ?? 0;
    if (add <= 0) continue;
    // Dia de cobrança (com clamp pro último dia do mês se recurringDay > dias do mês).
    const targetDay = Math.min(p.recurringDay!, daysInMonth);
    // v1.2-BZ: "pega" o ciclo do mês assim que chega/passa o dia de cobrança
    // (antes só no dia exato — se o deploy caísse depois do dia, o ciclo do mês
    // nunca entrava). Idempotência garante 1x por mês.
    if (dom < targetDay) continue;
    // Idempotência: já gerou neste mês (auto via lastRecurrenceAt OU renovação
    // manual registrada neste mês)? pula.
    const autoThisMonth =
      p.lastRecurrenceAt != null &&
      p.lastRecurrenceAt.getFullYear() === y &&
      p.lastRecurrenceAt.getMonth() === m;
    if (autoThisMonth || p.renewals.length > 0) {
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.privatePackageRenewal.create({
        data: { packageId: p.id, paidAt: now, classesAdded: add, value: null, note: "recorrência automática" },
      });
      const newTotal = p.totalClasses + add;
      const completed = countCompleted(p.sessions);
      await tx.privatePackage.update({
        where: { id: p.id },
        data: {
          totalClasses: newTotal,
          status: deriveStatus(p.status, completed, newTotal),
          lastRecurrenceAt: now,
        },
      });
      await appendLeadNote(
        {
          tenantId: p.tenantId,
          leadId: p.leadId,
          kind: "PRIVATE_PACKAGE_RENEWED",
          body: `Recorrência automática: +${add} aulas`,
          metadata: { packageId: p.id, classesAdded: add, auto: true },
        },
        tx,
      );
    });
    generated++;
  }
  return { generated, skipped };
}

/**
 * Recalcula o status do pacote a partir das sessões (concluídas >= total →
 * COMPLETED). v1.1-CF: fica AQUI (não mais dentro do actions de particulares)
 * pra que a confirmação de aula PELA TELA DO PROFESSOR também dispare o
 * recálculo — antes só o módulo de particulares chamava, então pacote com
 * todas as aulas confirmadas pelo professor ficava preso em "andamento".
 */
export async function recomputePackageStatus(packageId: string): Promise<void> {
  const pkg = await prisma.privatePackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      status: true,
      totalClasses: true,
      sessions: { select: { completedAt: true } },
    },
  });
  if (!pkg) return;
  const completed = countCompleted(pkg.sessions);
  const next = deriveStatus(pkg.status, completed, pkg.totalClasses);
  if (next === pkg.status) return;

  await prisma.privatePackage.update({
    where: { id: pkg.id },
    data: { status: next },
  });
  if (next === "COMPLETED") {
    await appendLeadNote({
      tenantId: pkg.tenantId,
      leadId: pkg.leadId,
      kind: "PRIVATE_PACKAGE_COMPLETED",
      body: `Contrato de aulas particulares concluído (${completed}/${pkg.totalClasses})`,
      metadata: { packageId: pkg.id },
    });
  }
}

export async function getPrivatePackagesForList(
  membership: TenantUser,
  filters: { statuses?: PrivatePackageStatus[]; search?: string } = {},
) {
  const rows = await prisma.privatePackage.findMany({
    where: {
      tenantId: membership.tenantId,
      ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
      ...(filters.search?.trim()
        ? { lead: { name: { contains: filters.search.trim(), mode: "insensitive" } } }
        : {}),
    },
    select: {
      id: true,
      modalityId: true,
      totalClasses: true,
      value: true,
      paymentMethod: true,
      status: true,
      startDate: true,
      endDate: true,
      soldById: true,
      notes: true,
      recurring: true,
      recurringDay: true,
      recurringClasses: true,
      referralPromo: true,
      renewals: {
        select: { id: true, paidAt: true, classesAdded: true, value: true, note: true },
        orderBy: { paidAt: "desc" },
      },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          belt: true,
          beltDegree: true,
        },
      },
      modality: { select: { id: true, name: true, color: true } },
      soldBy: { select: { name: true, email: true } },
      sessions: {
        select: {
          id: true,
          scheduledDate: true,
          completedAt: true,
          notes: true,
          professorId: true,
          professor: { select: { name: true } },
        },
        orderBy: { scheduledDate: "asc" },
      },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  const isSeller = membership.role === "SELLER";
  return rows.map((r) => ({
    ...r,
    // SELLER não vê valor (mesma política das matrículas).
    value: isSeller ? null : r.value,
    renewals: r.renewals.map((rn) => ({ ...rn, value: isSeller ? null : rn.value })),
    completedCount: countCompleted(r.sessions),
  }));
}

export type PrivatePackageRow = Awaited<
  ReturnType<typeof getPrivatePackagesForList>
>[number];

export async function findPackageInScope(
  membership: TenantUser,
  packageId: string,
) {
  return prisma.privatePackage.findFirst({
    where: { id: packageId, tenantId: membership.tenantId },
    include: { sessions: { select: { id: true, completedAt: true } } },
  });
}

/**
 * Receita de aulas particulares (v1.1-AO) — soma do valor dos pacotes.
 * `thisMonth` filtra por startDate dentro do mês corrente; `allTime` soma
 * tudo que não foi cancelado.
 */
export async function getPrivateRevenue(
  tenantId: string,
  monthStart: Date,
  nextMonthStart: Date,
): Promise<{ thisMonth: number; allTime: number; activeCount: number }> {
  const packages = await prisma.privatePackage.findMany({
    where: { tenantId, status: { not: "CANCELED" } },
    select: { value: true, startDate: true, status: true },
  });
  let thisMonth = 0;
  let allTime = 0;
  let activeCount = 0;
  for (const p of packages) {
    const v = Number(p.value);
    allTime += v;
    if (p.startDate >= monthStart && p.startDate < nextMonthStart) thisMonth += v;
    if (p.status === "ACTIVE") activeCount++;
  }
  return { thisMonth, allTime, activeCount };
}

/**
 * Contagens de pacotes particulares por situação (v1.1-AV) — pro Quadro do
 * Vitor, SEPARADAS das matrículas (nunca somadas nos números de mensalista).
 */
export async function getPrivatePackageCounts(tenantId: string) {
  const [active, completed, canceled] = await Promise.all([
    prisma.privatePackage.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.privatePackage.count({ where: { tenantId, status: "COMPLETED" } }),
    prisma.privatePackage.count({ where: { tenantId, status: "CANCELED" } }),
  ]);
  return { active, completed, canceled };
}
