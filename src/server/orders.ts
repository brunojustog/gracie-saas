/**
 * v1.2-BB: camada de dados das encomendas (lojinha). Encomenda = aluno pediu um
 * item que não tem em estoque. Registro simples pra Gisele controlar.
 *
 * v1.2-CC: pagamento (total/parcial) de uma encomenda é lançado como VENDA da
 * lojinha (Sale com orderId) — entra no caixa/histórico. O saldo não pago
 * (amount − pago) é DÉBITO do aluno (aparece na ficha dele). `paymentStatus`
 * é derivado do pago vs amount.
 */
import { prisma } from "@/lib/prisma";

/** Pago até agora = soma das vendas (Sale) vinculadas à encomenda. */
function paidFromPayments(payments: Array<{ total: unknown }>): number {
  return payments.reduce((s, p) => s + Number(p.total), 0);
}

export async function getOrdersForTenant(tenantId: string) {
  const rows = await prisma.order.findMany({
    where: { tenantId },
    orderBy: { orderedAt: "desc" },
    select: {
      id: true,
      item: true,
      quantity: true,
      matricula: true,
      customerName: true,
      customerLeadId: true,
      size: true,
      progress: true,
      orderedAt: true,
      paymentStatus: true,
      paymentMethod: true,
      paymentPlan: true,
      amount: true,
      cost: true,
      pickupAt: true,
      notes: true,
      status: true,
      stage: true,
      isGift: true,
      createdAt: true,
      payments: {
        orderBy: { paidAt: "asc" },
        select: { id: true, total: true, paidAt: true, paymentMethod: true },
      },
    },
  });
  return rows.map((r) => {
    const amount = r.amount != null ? Number(r.amount) : null;
    const paid = paidFromPayments(r.payments);
    const balance = amount != null ? Math.max(0, amount - paid) : 0;
    return {
      ...r,
      amount,
      cost: r.cost != null ? Number(r.cost) : null,
      paid,
      balance,
      payments: r.payments.map((p) => ({
        id: p.id,
        total: Number(p.total),
        paidAt: p.paidAt,
        paymentMethod: p.paymentMethod,
      })),
    };
  });
}

export type OrderRow = Awaited<ReturnType<typeof getOrdersForTenant>>[number];

export async function findOrderInTenant(tenantId: string, id: string) {
  return prisma.order.findFirst({ where: { id, tenantId }, select: { id: true } });
}

/**
 * v1.2-CC: encomendas com SALDO DEVEDOR de um aluno (pra ficha). Não canceladas,
 * com amount definido e pago < amount. Débito = amount − pago.
 */
export type OrderDebitRow = {
  id: string;
  item: string;
  quantity: number;
  orderedAt: Date;
  amount: number;
  paid: number;
  balance: number;
  paymentPlan: string | null;
  stage: string;
};

export async function getOrderDebitsForLead(
  tenantId: string,
  leadId: string,
): Promise<OrderDebitRow[]> {
  const rows = await prisma.order.findMany({
    where: {
      tenantId,
      customerLeadId: leadId,
      status: { not: "CANCELED" },
      isGift: false,
      amount: { not: null },
    },
    orderBy: { orderedAt: "desc" },
    select: {
      id: true,
      item: true,
      quantity: true,
      orderedAt: true,
      amount: true,
      paymentPlan: true,
      stage: true,
      payments: { select: { total: true } },
    },
  });
  return rows
    .map((r) => {
      const amount = Number(r.amount);
      const paid = paidFromPayments(r.payments);
      return {
        id: r.id,
        item: r.item,
        quantity: r.quantity,
        orderedAt: r.orderedAt,
        amount,
        paid,
        balance: Math.max(0, amount - paid),
        paymentPlan: r.paymentPlan,
        stage: r.stage,
      };
    })
    .filter((r) => r.balance > 0);
}
