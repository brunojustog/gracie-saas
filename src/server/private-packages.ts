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

/** Nº de cobranças mensais que já deveriam ter acontecido (BACKFILL). v1.2-CA.
 *
 * Âncora: a 1ª cobrança da recorrência cai no `recurringDay` do mês SEGUINTE ao
 * início do pacote; daí em diante, todo mês. Retorna a lista de datas de
 * cobrança (meio-dia BR) que já venceram (<= now) e que AINDA não têm uma
 * renovação registrada naquele mês (pula as já lançadas — manual ou auto).
 */
function missingRecurrenceDates(
  startDate: Date,
  recurringDay: number,
  renewalMonthKeys: Set<string>,
  now: Date,
): Date[] {
  const out: Date[] = [];
  // 1º mês candidato = mês seguinte ao do início.
  let cy = startDate.getFullYear();
  let cm = startDate.getMonth() + 1;
  if (cm > 11) { cm = 0; cy += 1; }
  // Trava de segurança: no máx. 24 meses pra trás.
  let guard = 0;
  while (guard++ < 400) {
    // Passou do mês atual? para.
    if (cy > now.getFullYear() || (cy === now.getFullYear() && cm > now.getMonth())) break;
    const dim = new Date(cy, cm + 1, 0).getDate();
    const day = Math.min(recurringDay, dim);
    const billing = new Date(cy, cm, day, 12, 0, 0);
    if (billing.getTime() <= now.getTime() && !renewalMonthKeys.has(`${cy}-${cm}`)) {
      out.push(billing);
    }
    cm += 1;
    if (cm > 11) { cm = 0; cy += 1; }
  }
  return out;
}

/**
 * v1.2-BV/CA: gera automaticamente os ciclos de recorrência dos pacotes
 * particulares. Rodado 1x/dia (cron diário). AUTO-CURATIVO: pra cada pacote
 * recorrente, gera TODOS os ciclos que já deveriam ter acontecido desde o
 * início (ou desde a última renovação), não só o do dia — assim ciclos que
 * passaram (deploy tardio, mês sem rodar) entram sozinhos. Idempotente: pula
 * meses que já têm renovação registrada (manual ou automática).
 */
export async function runPrivateRecurrence(
  now: Date = new Date(),
): Promise<{ generated: number; skipped: number }> {
  const pkgs = await prisma.privatePackage.findMany({
    where: { recurring: true, recurringDay: { not: null }, status: { not: "CANCELED" } },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      startDate: true,
      recurringDay: true,
      recurringClasses: true,
      totalClasses: true,
      status: true,
      sessions: { select: { completedAt: true } },
      renewals: { select: { paidAt: true } },
    },
  });

  let generated = 0;
  let skipped = 0;
  for (const p of pkgs) {
    const add = p.recurringClasses ?? 0;
    if (add <= 0) continue;

    // Meses que já têm renovação (chave ano-mês) — pra não duplicar.
    const renewalMonthKeys = new Set(
      p.renewals.map((r) => `${r.paidAt.getFullYear()}-${r.paidAt.getMonth()}`),
    );
    const missing = missingRecurrenceDates(p.startDate, p.recurringDay!, renewalMonthKeys, now);
    if (missing.length === 0) {
      skipped++;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      let total = p.totalClasses;
      for (const billing of missing) {
        await tx.privatePackageRenewal.create({
          data: { packageId: p.id, paidAt: billing, classesAdded: add, value: null, note: "recorrência automática" },
        });
        total += add;
        await appendLeadNote(
          {
            tenantId: p.tenantId,
            leadId: p.leadId,
            kind: "PRIVATE_PACKAGE_RENEWED",
            body: `Recorrência automática: +${add} aulas (cobrança ${billing.toLocaleDateString("pt-BR")})`,
            metadata: { packageId: p.id, classesAdded: add, auto: true, billingDate: billing.toISOString() },
          },
          tx,
        );
      }
      const completed = countCompleted(p.sessions);
      await tx.privatePackage.update({
        where: { id: p.id },
        data: {
          totalClasses: total,
          status: deriveStatus(p.status, completed, total),
          lastRecurrenceAt: missing[missing.length - 1],
        },
      });
    });
    generated += missing.length;
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
