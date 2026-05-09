/**
 * Camada analítica do dashboard de KPIs (fase 10).
 *
 * Política: tudo escopado via `scopedLeadWhere(membership)` para que SELLER
 * só veja números dos próprios leads. ADMIN/MANAGER vê o tenant inteiro.
 */
import { Prisma, type TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/period";
import { previousPeriod } from "@/lib/period";
import { scopedLeadWhere } from "@/server/leads";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData(
  membership: TenantUser,
  period: Period,
) {
  const prev = previousPeriod(period);
  const scope = scopedLeadWhere(membership);
  const tenantId = membership.tenantId;

  const isSeller = membership.role === "SELLER";
  const sellerLeadFilter = isSeller
    ? { lead: { assignedSellerId: membership.userId } }
    : {};

  const [
    leadsNow,
    leadsPrev,
    classesNow,
    classesPrev,
    attendedNow,
    attendedPrev,
    enrollmentsNow,
    enrollmentsPrev,
    activeRevenueAgg,
    funnelGroups,
    leadsByDayRaw,
    enrollmentsByModality,
    sellerStats,
  ] = await Promise.all([
    // KPIs do período atual
    prisma.lead.count({
      where: { ...scope, createdAt: { gte: period.from, lte: period.to } },
    }),
    prisma.lead.count({
      where: { ...scope, createdAt: { gte: prev.from, lte: prev.to } },
    }),

    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        scheduledDate: { gte: period.from, lte: period.to },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        scheduledDate: { gte: prev.from, lte: prev.to },
      },
    }),

    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        status: "ATTENDED",
        attendedAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        status: "ATTENDED",
        attendedAt: { gte: prev.from, lte: prev.to },
      },
    }),

    prisma.enrollment.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        status: "ACTIVE",
        enrolledAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.enrollment.count({
      where: {
        tenantId,
        ...sellerLeadFilter,
        status: "ACTIVE",
        enrolledAt: { gte: prev.from, lte: prev.to },
      },
    }),

    // Receita mensal corrente (todas matrículas ACTIVE — independe do período)
    prisma.enrollment.aggregate({
      where: {
        tenantId,
        ...sellerLeadFilter,
        status: "ACTIVE",
      },
      _sum: { monthlyValue: true },
    }),

    // Funil: quantos leads em cada stage (criados no período)
    prisma.lead.groupBy({
      by: ["stageId"],
      where: { ...scope, createdAt: { gte: period.from, lte: period.to } },
      _count: { _all: true },
    }),

    // Leads por dia: $queryRaw porque Prisma não suporta groupBy(date_trunc(...))
    // Limita a 31 dias máx — o range já vem cap de presets.
    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::bigint AS count
      FROM "Lead"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${period.from}
        AND "createdAt" <= ${period.to}
        ${
          isSeller
            ? Prisma.sql`AND "assignedSellerId" = ${membership.userId}`
            : Prisma.empty
        }
      GROUP BY day
      ORDER BY day
    `),

    // Distribuição por modalidade (matrículas ACTIVE)
    prisma.enrollment.groupBy({
      by: ["modalityId"],
      where: { tenantId, ...sellerLeadFilter, status: "ACTIVE" },
      _count: { _all: true },
    }),

    // Ranking de vendedoras: count de leads + matrículas + receita por vendedora
    // Apenas pra ADMIN/MANAGER. SELLER não vê isso.
    isSeller
      ? Promise.resolve([])
      : prisma.lead.groupBy({
          by: ["assignedSellerId"],
          where: { tenantId, createdAt: { gte: period.from, lte: period.to } },
          _count: { _all: true },
        }),
  ]);

  // Resolve nomes de stages, modalidades e users em batches
  const [stages, modalities, sellerEnrollments, sellerUsers] = await Promise.all([
    prisma.stage.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true, order: true, isWon: true, isLost: true },
      orderBy: { order: "asc" },
    }),
    prisma.modality.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true },
    }),
    isSeller
      ? Promise.resolve([])
      : prisma.enrollment.groupBy({
          by: ["leadId"],
          where: {
            tenantId,
            status: "ACTIVE",
            enrolledAt: { gte: period.from, lte: period.to },
          },
          _sum: { monthlyValue: true },
        }),
    isSeller
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            tenants: { some: { tenantId, role: "SELLER", active: true } },
          },
          select: { id: true, name: true, email: true },
        }),
  ]);

  // Agrega ranking de vendedoras: leads + matrículas + receita por seller
  const leadsToSeller = isSeller
    ? new Map<string, string>() // leadId → sellerId, vazio
    : await prisma.lead
        .findMany({
          where: {
            tenantId,
            id: { in: sellerEnrollments.map((e) => e.leadId) },
          },
          select: { id: true, assignedSellerId: true },
        })
        .then((rows) => new Map(rows.map((r) => [r.id, r.assignedSellerId ?? ""])));

  const ranking = isSeller
    ? []
    : sellerUsers
        .map((u) => {
          const leads = sellerStats.find((s) => s.assignedSellerId === u.id)?._count?._all ?? 0;
          const enrollmentsRevenue = sellerEnrollments
            .filter((e) => leadsToSeller.get(e.leadId) === u.id)
            .reduce((sum, e) => sum + Number(e._sum.monthlyValue ?? 0), 0);
          const matriculas = sellerEnrollments.filter(
            (e) => leadsToSeller.get(e.leadId) === u.id,
          ).length;
          return {
            userId: u.id,
            name: u.name ?? u.email,
            leads,
            matriculas,
            conversion: leads > 0 ? matriculas / leads : 0,
            revenue: enrollmentsRevenue,
          };
        })
        .sort((a, b) => b.matriculas - a.matriculas);

  // Funil agregado: stage com count (preserva ordem do stage)
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const funnel = stages
    .filter((s) => !s.isLost) // estágios "perdidos" são separados; aqui é o funil ativo
    .map((s) => ({
      stageId: s.id,
      name: s.name,
      color: s.color,
      isWon: s.isWon,
      count:
        funnelGroups.find((g) => g.stageId === s.id)?._count?._all ?? 0,
    }));

  // Modalidades: name + color resolvidos
  const byModality = enrollmentsByModality.map((g) => {
    const m = modalities.find((x) => x.id === g.modalityId);
    return {
      modalityId: g.modalityId,
      name: m?.name ?? "?",
      color: m?.color ?? "#6B7280",
      count: g._count._all,
    };
  });

  // Leads por dia: bigint → number (count cabe num int)
  const leadsByDay = leadsByDayRaw.map((row) => ({
    day: row.day,
    count: Number(row.count),
  }));

  return {
    period,
    previous: prev,
    isSeller,
    kpis: {
      leadsNew: { current: leadsNow, previous: leadsPrev },
      classesScheduled: { current: classesNow, previous: classesPrev },
      attended: { current: attendedNow, previous: attendedPrev },
      enrollments: { current: enrollmentsNow, previous: enrollmentsPrev },
      monthlyRevenue: Number(activeRevenueAgg._sum.monthlyValue ?? 0),
      conversionPct:
        leadsNow > 0 ? (enrollmentsNow / leadsNow) * 100 : null,
      conversionPrevPct:
        leadsPrev > 0 ? (enrollmentsPrev / leadsPrev) * 100 : null,
    },
    funnel,
    leadsByDay,
    byModality,
    ranking,
    stagesById: Object.fromEntries(stageById.entries()),
  };
}
