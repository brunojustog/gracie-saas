/**
 * v1.2-BB: camada de dados das encomendas (lojinha). Encomenda = aluno pediu um
 * item que não tem em estoque. Registro simples pra Gisele controlar; não mexe
 * em estoque nem gera venda. Visível a todo staff do tenant.
 */
import { prisma } from "@/lib/prisma";

export async function getOrdersForTenant(tenantId: string) {
  const rows = await prisma.order.findMany({
    where: { tenantId },
    // Abertas primeiro (OPEN < FULFILLED < CANCELED alfabético não serve), então
    // ordenamos por data; a UI separa por status.
    orderBy: { orderedAt: "desc" },
    select: {
      id: true,
      item: true,
      customerName: true,
      size: true,
      orderedAt: true,
      paymentStatus: true,
      amount: true,
      notes: true,
      status: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    amount: r.amount != null ? Number(r.amount) : null,
  }));
}

export type OrderRow = Awaited<ReturnType<typeof getOrdersForTenant>>[number];

export async function findOrderInTenant(tenantId: string, id: string) {
  return prisma.order.findFirst({ where: { id, tenantId }, select: { id: true } });
}
