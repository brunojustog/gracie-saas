/**
 * Camada de dados de aulas particulares (v1.1-AO).
 *
 * Pacote = compra avulsa de N aulas por um aluno NÃO-mensalista. NUNCA vira
 * Enrollment (não infla a contagem de matriculados). Visibilidade segue
 * v1.1-O: qualquer role do tenant vê todos.
 */
import type { PrivatePackageStatus, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
        select: { id: true, scheduledDate: true, completedAt: true, notes: true },
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
