/**
 * Camada analítica do dashboard de KPIs (fase 10, ampliada v1.1-R).
 *
 * Política: tudo escopado via `scopedLeadWhere(membership)` (isolamento por
 * tenant). Visibilidade dentro do tenant segue a regra v1.1-O documentada
 * em `src/server/leads.ts`: qualquer role vê todos os leads. `isSeller`
 * ainda existe pra esconder ranking de vendedoras e KPI de receita na UI,
 * mas NÃO restringe os agregados.
 *
 * Filtros (v1.1-R): origin, modalityId, sellerId, tag — compostos no `where`
 * base; aplicam-se a TODOS os agregados pra manter coerência (variação %,
 * funil, leads/dia, etc. respondem ao mesmo recorte).
 */
import { Prisma, type TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/period";
import { previousPeriod } from "@/lib/period";
import type { DashboardFilters } from "@/lib/analytics-filters";
import { scopedLeadWhere } from "@/server/leads";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

// Threshold pro KPI "leads parados por estágio" (proxy v1.1-R). Lead sem
// interação por mais que N dias e em stage ativo (não won/lost) vira parado.
const STAGNATED_DAYS = 7;

export async function getDashboardData(
  membership: TenantUser,
  period: Period,
  filters: DashboardFilters = {},
) {
  const prev = previousPeriod(period);
  const tenantId = membership.tenantId;
  const isSeller = membership.role === "SELLER";

  // Filtros base aplicados em TODAS as queries de Lead: scope de tenant +
  // filtros da toolbar (origem, modalidade, vendedora, tag). Visibilidade
  // SELLER não restringe agregados — política v1.1-O.
  const filterWhere: Prisma.LeadWhereInput = {};
  if (filters.origin) filterWhere.origin = filters.origin;
  if (filters.modalityId) filterWhere.modalityId = filters.modalityId;
  if (filters.sellerId && !isSeller) {
    // SELLER não pode escolher outra vendedora via URL — tampering ignora.
    filterWhere.assignedSellerId = filters.sellerId;
  }
  if (filters.tag) filterWhere.tags = { has: filters.tag };

  const leadWhereBase: Prisma.LeadWhereInput = {
    ...scopedLeadWhere(membership),
    ...filterWhere,
  };

  // Filtros equivalentes pra queries que partem de Enrollment/Class
  // (precisam navegar via `lead: { ... }`).
  const hasLeadConstraint = Object.keys(filterWhere).length > 0;
  const leadFilter = hasLeadConstraint ? { lead: filterWhere } : {};

  // Helper: monta um fragmento "AND ..." que espelha filterWhere em SQL raw,
  // com prefixo opcional pra qualificar colunas (ex: "l.").
  const buildLeadSqlFilter = (tablePrefix = ""): Prisma.Sql => {
    const p = Prisma.raw(tablePrefix); // identifier safe (sem aspas)
    const conds: Prisma.Sql[] = [];
    if (filters.origin) {
      conds.push(Prisma.sql`${p}"origin"::text = ${filters.origin}`);
    }
    if (filters.modalityId) {
      conds.push(Prisma.sql`${p}"modalityId" = ${filters.modalityId}`);
    }
    if (filters.sellerId && !isSeller) {
      conds.push(Prisma.sql`${p}"assignedSellerId" = ${filters.sellerId}`);
    }
    if (filters.tag) {
      conds.push(Prisma.sql`${filters.tag} = ANY(${p}"tags")`);
    }
    return conds.length > 0
      ? Prisma.sql` AND ${Prisma.join(conds, ` AND `)}`
      : Prisma.empty;
  };
  const leadSqlFilter = buildLeadSqlFilter(); // sem alias (tabela única)
  const leadSqlFilterAliased = buildLeadSqlFilter("l."); // com JOIN

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
    conversionByOriginRaw,
    avgFirstResponseRaw,
    stagnatedByStageRaw,
  ] = await Promise.all([
    prisma.lead.count({
      where: { ...leadWhereBase, firstInteractionAt: { gte: period.from, lte: period.to } },
    }),
    prisma.lead.count({
      where: { ...leadWhereBase, firstInteractionAt: { gte: prev.from, lte: prev.to } },
    }),

    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...leadFilter,
        scheduledDate: { gte: period.from, lte: period.to },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...leadFilter,
        scheduledDate: { gte: prev.from, lte: prev.to },
      },
    }),

    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...leadFilter,
        status: "ATTENDED",
        attendedAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        ...leadFilter,
        status: "ATTENDED",
        attendedAt: { gte: prev.from, lte: prev.to },
      },
    }),

    prisma.enrollment.count({
      where: {
        tenantId,
        ...leadFilter,
        status: "ACTIVE",
        enrolledAt: { gte: period.from, lte: period.to },
      },
    }),
    prisma.enrollment.count({
      where: {
        tenantId,
        ...leadFilter,
        status: "ACTIVE",
        enrolledAt: { gte: prev.from, lte: prev.to },
      },
    }),

    // Receita ACTIVE corrente (independe do período; é a foto do MRR)
    prisma.enrollment.aggregate({
      where: { tenantId, ...leadFilter, status: "ACTIVE" },
      _sum: { monthlyValue: true },
    }),

    prisma.lead.groupBy({
      by: ["stageId"],
      where: {
        ...leadWhereBase,
        firstInteractionAt: { gte: period.from, lte: period.to },
      },
      _count: { _all: true },
    }),

    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('day', "firstInteractionAt")::date AS day, COUNT(*)::bigint AS count
      FROM "Lead"
      WHERE "tenantId" = ${tenantId}
        AND "firstInteractionAt" >= ${period.from}
        AND "firstInteractionAt" <= ${period.to}
        ${leadSqlFilter}
      GROUP BY day
      ORDER BY day
    `),

    prisma.enrollment.groupBy({
      by: ["modalityId"],
      where: { tenantId, ...leadFilter, status: "ACTIVE" },
      _count: { _all: true },
    }),

    isSeller
      ? Promise.resolve([])
      : prisma.lead.groupBy({
          by: ["assignedSellerId"],
          where: {
            tenantId,
            firstInteractionAt: { gte: period.from, lte: period.to },
            ...filterWhere,
          },
          _count: { _all: true },
        }),

    // ── KPIs NOVOS v1.1-R ────────────────────────────────────────────────

    // Conversão por origem: pra cada origem, conta leads no período e
    // quantos viraram matrícula ACTIVE. ESQUERDA pra direita: origem,
    // total, matrículas. Computa rate no caller.
    prisma.$queryRaw<
      Array<{ origin: string; total: bigint; converted: bigint }>
    >(Prisma.sql`
      SELECT
        l."origin"::text AS origin,
        COUNT(*)::bigint AS total,
        COUNT(e.id)::bigint AS converted
      FROM "Lead" l
      LEFT JOIN "Enrollment" e
        ON e."leadId" = l.id AND e."status" = 'ACTIVE'
      WHERE l."tenantId" = ${tenantId}
        AND l."firstInteractionAt" >= ${period.from}
        AND l."firstInteractionAt" <= ${period.to}
        ${leadSqlFilterAliased}
      GROUP BY l."origin"
      ORDER BY total DESC
    `),

    // Tempo médio até 1ª ação humana: diff em segundos entre createdAt
    // do lead e createdAt da PRIMEIRA LeadNote com authorId não-nulo
    // (= humano fez algo). Filtro: leads do período. Exclui leads que
    // ainda não foram tocados (sem nota humana).
    prisma.$queryRaw<Array<{ avg_seconds: number | null }>>(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (first_note."createdAt" - l."createdAt")))::float AS avg_seconds
      FROM "Lead" l
      JOIN LATERAL (
        SELECT "createdAt" FROM "LeadNote"
        WHERE "leadId" = l.id AND "authorId" IS NOT NULL
        ORDER BY "createdAt" ASC
        LIMIT 1
      ) first_note ON true
      WHERE l."tenantId" = ${tenantId}
        AND l."firstInteractionAt" >= ${period.from}
        AND l."firstInteractionAt" <= ${period.to}
        AND first_note."createdAt" > l."createdAt"
        ${leadSqlFilterAliased}
    `),

    // Leads "parados" por estágio: stage ATIVO (não won/lost) + sem
    // interação há mais que STAGNATED_DAYS dias. Proxy de gargalo no
    // funil sem precisar de histórico de transições. Não usa período
    // (sempre olha o "agora" do funil) mas respeita filtros.
    prisma.lead.groupBy({
      by: ["stageId"],
      where: {
        ...leadWhereBase,
        lastInteractionAt: {
          lt: new Date(Date.now() - STAGNATED_DAYS * 24 * 60 * 60 * 1000),
        },
        stage: { isWon: false, isLost: false, active: true },
      },
      _count: { _all: true },
    }),
  ]);

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
            ...(hasLeadConstraint ? leadFilter : {}),
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

  const leadsToSeller = isSeller
    ? new Map<string, string>()
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

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const funnel = stages
    .filter((s) => !s.isLost)
    .map((s) => ({
      stageId: s.id,
      name: s.name,
      color: s.color,
      isWon: s.isWon,
      count:
        funnelGroups.find((g) => g.stageId === s.id)?._count?._all ?? 0,
    }));

  // Funil de conversão (mesma lógica da v1.1-H — cohort do período)
  const cohortFilter = {
    ...leadWhereBase,
    firstInteractionAt: { gte: period.from, lte: period.to },
  };
  const POST_AGENDAMENTO = ["Agendamento", "Comparecimento", "Negociação", "Ganho"];
  const POST_COMPARECIMENTO = ["Comparecimento", "Negociação", "Ganho"];

  const [cohortTotal, cohortAgendaram, cohortCompareceram, cohortMatricularam] =
    await Promise.all([
      prisma.lead.count({ where: cohortFilter }),
      prisma.lead.count({
        where: { ...cohortFilter, stage: { name: { in: POST_AGENDAMENTO } } },
      }),
      prisma.lead.count({
        where: { ...cohortFilter, stage: { name: { in: POST_COMPARECIMENTO } } },
      }),
      prisma.lead.count({
        where: { ...cohortFilter, stage: { isWon: true } },
      }),
    ]);

  const rate = (numerator: number, denominator: number) =>
    denominator > 0 ? (numerator / denominator) * 100 : null;

  const conversionFunnel = [
    { label: "Leads novos", count: cohortTotal, fromPreviousPct: null as number | null },
    {
      label: "Agendaram",
      count: cohortAgendaram,
      fromPreviousPct: rate(cohortAgendaram, cohortTotal),
    },
    {
      label: "Compareceram",
      count: cohortCompareceram,
      fromPreviousPct: rate(cohortCompareceram, cohortAgendaram),
    },
    {
      label: "Matricularam",
      count: cohortMatricularam,
      fromPreviousPct: rate(cohortMatricularam, cohortCompareceram),
    },
  ];

  const byModality = enrollmentsByModality.map((g) => {
    const m = modalities.find((x) => x.id === g.modalityId);
    return {
      modalityId: g.modalityId,
      name: m?.name ?? "?",
      color: m?.color ?? "#6B7280",
      count: g._count._all,
    };
  });

  const leadsByDay = leadsByDayRaw.map((row) => ({
    day: row.day,
    count: Number(row.count),
  }));

  // Conversão por origem: serialização BigInt → number
  const conversionByOrigin = conversionByOriginRaw
    .map((r) => ({
      origin: r.origin,
      total: Number(r.total),
      converted: Number(r.converted),
      rate: Number(r.total) > 0 ? (Number(r.converted) / Number(r.total)) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const avgFirstResponseSeconds = avgFirstResponseRaw[0]?.avg_seconds ?? null;

  // Estágios parados: enriquecer com nome/color do stage (ordem do funil)
  const stagnatedByStage = stages
    .filter((s) => !s.isWon && !s.isLost)
    .map((s) => ({
      stageId: s.id,
      name: s.name,
      color: s.color,
      count:
        stagnatedByStageRaw.find((g) => g.stageId === s.id)?._count?._all ?? 0,
    }))
    .filter((s) => s.count > 0);

  return {
    period,
    previous: prev,
    filters,
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
      avgFirstResponseSeconds,
    },
    funnel,
    conversionFunnel,
    conversionByOrigin,
    stagnatedByStage,
    stagnatedDays: STAGNATED_DAYS,
    leadsByDay,
    byModality,
    ranking,
    stagesById: Object.fromEntries(stageById.entries()),
  };
}
