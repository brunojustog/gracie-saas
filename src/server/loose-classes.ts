/**
 * Camada de dados de aulas avulsas (v1.1-BD).
 *
 * Aula avulsa = pessoa paga UMA aula só, sem pacote nem matrícula. Substitui
 * o uso da lojinha. NÃO infla a contagem de matriculados.
 *
 * v1.1-CA: a aula avulsa é a VENDA que a vendedora faz, então ela precisa
 * cadastrar e ver o valor por aula (reunião 30/07). O card de receita
 * agregada da página é que segue oculto pro SELLER.
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

  return rows;
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
