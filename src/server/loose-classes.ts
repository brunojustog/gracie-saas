/**
 * Camada de dados de aulas avulsas (v1.1-BD).
 *
 * Aula avulsa = pessoa paga UMA aula só, sem pacote nem matrícula. Substitui
 * o uso da lojinha. NÃO infla a contagem de matriculados. Visibilidade segue
 * v1.1-O: qualquer role do tenant vê todas; SELLER não vê valores.
 */
import type { TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getLooseClassesForList(
  membership: TenantUser,
  filters: { search?: string } = {},
) {
  const rows = await prisma.looseClass.findMany({
    where: {
      tenantId: membership.tenantId,
      ...(filters.search?.trim()
        ? { lead: { name: { contains: filters.search.trim(), mode: "insensitive" } } }
        : {}),
    },
    select: {
      id: true,
      value: true,
      classDate: true,
      paymentMethod: true,
      soldById: true,
      notes: true,
      lead: { select: { id: true, name: true, phone: true } },
      modality: { select: { id: true, name: true, color: true } },
      soldBy: { select: { name: true, email: true } },
    },
    orderBy: { classDate: "desc" },
  });

  const isSeller = membership.role === "SELLER";
  return rows.map((r) => ({ ...r, value: isSeller ? null : r.value }));
}

export type LooseClassRow = Awaited<
  ReturnType<typeof getLooseClassesForList>
>[number];

export async function findLooseClassInScope(
  membership: TenantUser,
  id: string,
) {
  return prisma.looseClass.findFirst({
    where: { id, tenantId: membership.tenantId },
    select: { id: true, leadId: true },
  });
}

/**
 * Receita de aulas avulsas (v1.1-BD) — `thisMonth` filtra classDate no mês
 * corrente; `allTime` soma tudo. `countThisMonth` = nº de aulas no mês.
 */
export async function getLooseRevenue(
  tenantId: string,
  monthStart: Date,
  nextMonthStart: Date,
): Promise<{
  thisMonth: number;
  allTime: number;
  countThisMonth: number;
  countAllTime: number;
}> {
  const rows = await prisma.looseClass.findMany({
    where: { tenantId },
    select: { value: true, classDate: true },
  });
  let thisMonth = 0;
  let allTime = 0;
  let countThisMonth = 0;
  for (const r of rows) {
    const v = Number(r.value);
    allTime += v;
    if (r.classDate >= monthStart && r.classDate < nextMonthStart) {
      thisMonth += v;
      countThisMonth++;
    }
  }
  return { thisMonth, allTime, countThisMonth, countAllTime: rows.length };
}
