/**
 * Camada de dados do "Quadro do Vitor" (v1.1-AK) — painel gerencial
 * ADMIN-only. Tudo escopado por tenant. Uma chamada (`getQuadroData`)
 * monta todos os blocos via Promise.all.
 *
 * Decisão de design: como o volume é pequeno (centenas de matrículas),
 * puxamos linhas cruas e agregamos em JS — mais legível e flexível que
 * vários groupBy/raw, sem custo relevante.
 */
import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { getPrivateRevenue } from "@/server/private-packages";

/** Percentual seguro (0 quando o denominador é 0). */
export function ratePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

/** Starts de mês, do mais antigo ao atual (n meses, incluindo o corrente). */
export function lastMonthStarts(now: Date, n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(startOfMonth(subMonths(now, i)));
  return out;
}

type GenderSplit = { female: number; male: number; unknown: number };

function emptySplit(): GenderSplit {
  return { female: 0, male: 0, unknown: 0 };
}

export async function getQuadroData(tenantId: string) {
  const now = new Date();
  const today = startOfDay(now);

  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400_000);
  const since90 = new Date(today.getTime() - 90 * 86400_000);
  const since30 = new Date(today.getTime() - 30 * 86400_000);
  const since7 = new Date(today.getTime() - 7 * 86400_000);

  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfMonth(subMonths(now, -1));

  const [
    activeEnrollments,
    canceledCount,
    allEnrollments,
    salesEnrollments,
    attendedClasses,
    posExpLeads,
    agendaClasses,
    privateRevenue,
  ] = await Promise.all([
    // Matrículas ativas (gênero + kids + plano + pagamento + vencimento)
    prisma.enrollment.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        nextDueDate: true,
        paymentMethod: true,
        monthlyValue: true,
        plan: { select: { id: true, name: true } },
        modality: { select: { isKids: true } },
        lead: { select: { gender: true } },
      },
    }),
    // Cancelamentos na vida da academia
    prisma.enrollment.count({ where: { tenantId, status: "CANCELED" } }),
    // Todas as matrículas (pra crescimento + churn mês a mês)
    prisma.enrollment.findMany({
      where: { tenantId },
      select: { enrolledAt: true, canceledAt: true, status: true },
    }),
    // Matrículas dos últimos 6 meses pra ranking por vendedora
    prisma.enrollment.findMany({
      where: { tenantId, enrolledAt: { gte: startOfMonth(subMonths(now, 5)) } },
      select: {
        enrolledAt: true,
        monthlyValue: true,
        lead: {
          select: {
            assignedSeller: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    // Aulas experimentais comparecidas nos últimos 90d (conversão)
    prisma.experimentalClass.findMany({
      where: { tenantId, status: "ATTENDED", scheduledDate: { gte: since90 } },
      select: {
        leadId: true,
        scheduledDate: true,
        lead: { select: { enrollment: { select: { id: true } } } },
      },
    }),
    // Leads que fizeram experimental e seguem em conversa (sem matrícula,
    // não perdidos, não excluídos)
    prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        enrollment: { is: null },
        stage: { isLost: false },
        experimentalClasses: { some: {} },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        lastInteractionAt: true,
        stage: { select: { name: true } },
        modality: { select: { name: true } },
        assignedSeller: { select: { name: true, email: true } },
        experimentalClasses: {
          select: { scheduledDate: true, status: true },
          orderBy: { scheduledDate: "desc" },
          take: 1,
        },
      },
      orderBy: { lastInteractionAt: "desc" },
    }),
    // Agenda de experimentais: semana passada + semana atual
    prisma.experimentalClass.findMany({
      where: { tenantId, scheduledDate: { gte: prevWeekStart, lte: thisWeekEnd } },
      select: {
        scheduledDate: true,
        status: true,
        lead: { select: { name: true, phone: true } },
        modality: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    // Receita de aulas particulares (v1.1-AO)
    getPrivateRevenue(tenantId, monthStart, nextMonthStart),
  ]);

  // ── Bloco "Número de matrículas" ─────────────────────────────────────────
  const adults = emptySplit();
  const kids = emptySplit();
  let overdue = 0;
  let monthlyRecurring = 0;
  const byPlan = new Map<string, number>();
  const byPayment = new Map<string, number>();

  for (const e of activeEnrollments) {
    if (e.nextDueDate && e.nextDueDate < today) overdue++;
    monthlyRecurring += Number(e.monthlyValue);
    const bucket = e.modality.isKids ? kids : adults;
    if (e.lead.gender === "FEMALE") bucket.female++;
    else if (e.lead.gender === "MALE") bucket.male++;
    else bucket.unknown++;
    byPlan.set(e.plan.name, (byPlan.get(e.plan.name) ?? 0) + 1);
    byPayment.set(e.paymentMethod, (byPayment.get(e.paymentMethod) ?? 0) + 1);
  }
  const totalActive = activeEnrollments.length;
  const totalAdults = adults.female + adults.male + adults.unknown;
  const totalKids = kids.female + kids.male + kids.unknown;

  // ── Crescimento (ativos no 1º dia de cada mês) + churn mensal ────────────
  const months = lastMonthStarts(now, 6);
  const activeAt = (date: Date) =>
    allEnrollments.filter(
      (e) => e.enrolledAt <= date && (!e.canceledAt || e.canceledAt > date),
    ).length;
  const growth = months.map((mStart, i) => {
    const monthEnd =
      i + 1 < months.length
        ? months[i + 1]!
        : startOfMonth(subMonths(now, -1)); // início do próximo mês
    const activeStart = activeAt(mStart);
    const canceledInMonth = allEnrollments.filter(
      (e) => e.canceledAt && e.canceledAt >= mStart && e.canceledAt < monthEnd,
    ).length;
    const newInMonth = allEnrollments.filter(
      (e) => e.enrolledAt >= mStart && e.enrolledAt < monthEnd,
    ).length;
    return {
      label: format(mStart, "MMM/yy", { locale: ptBR }),
      activeStart,
      newInMonth,
      canceledInMonth,
      churnPct: ratePct(canceledInMonth, activeStart),
    };
  });

  // ── Vendas (matrículas) por vendedora — últimos 3 meses ──────────────────
  const salesMonths = lastMonthStarts(now, 3);
  const salesMonthEnds = salesMonths.map((m, i) =>
    i + 1 < salesMonths.length ? salesMonths[i + 1]! : startOfMonth(subMonths(now, -1)),
  );
  type SellerRow = { name: string; counts: number[]; total: number };
  const sellerMap = new Map<string, SellerRow>();
  for (const e of salesEnrollments) {
    const seller = e.lead.assignedSeller;
    const key = seller?.id ?? "__none__";
    const name = seller?.name ?? seller?.email ?? "(sem vendedora)";
    if (!sellerMap.has(key)) {
      sellerMap.set(key, { name, counts: salesMonths.map(() => 0), total: 0 });
    }
    const row = sellerMap.get(key)!;
    const idx = salesMonths.findIndex(
      (m, i) => e.enrolledAt >= m && e.enrolledAt < salesMonthEnds[i]!,
    );
    if (idx >= 0) {
      row.counts[idx]!++;
      row.total++;
    }
  }
  const sellerRanking = [...sellerMap.values()].sort((a, b) => b.total - a.total);

  // ── Conversão experimental → matrícula (30d e 90d) ───────────────────────
  const convWindow = (since: Date) => {
    const inWindow = attendedClasses.filter((c) => c.scheduledDate >= since);
    const leadIds = new Set(inWindow.map((c) => c.leadId));
    const converted = new Set(
      inWindow.filter((c) => c.lead.enrollment).map((c) => c.leadId),
    );
    return {
      attended: leadIds.size,
      enrolled: converted.size,
      pct: ratePct(converted.size, leadIds.size),
    };
  };
  const conversion = { d30: convWindow(since30), d90: convWindow(since90) };

  // ── Pós-experimental em conversa (item 2) ────────────────────────────────
  const posExperimental = posExpLeads.map((l) => {
    const lastClass = l.experimentalClasses[0];
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      stage: l.stage.name,
      modality: l.modality?.name ?? null,
      seller: l.assignedSeller?.name ?? l.assignedSeller?.email ?? null,
      lastClassAt: lastClass?.scheduledDate ?? null,
      lastClassStatus: lastClass?.status ?? null,
      daysSince: lastClass
        ? differenceInCalendarDays(today, startOfDay(lastClass.scheduledDate))
        : null,
    };
  });
  const posExpLastWeek = posExperimental.filter(
    (l) => l.lastClassAt && l.lastClassAt >= since7,
  ).length;

  // ── Agenda: semana passada × semana atual ────────────────────────────────
  const mapClass = (c: (typeof agendaClasses)[number]) => ({
    scheduledDate: c.scheduledDate,
    status: c.status,
    leadName: c.lead.name,
    phone: c.lead.phone,
    modality: c.modality.name,
  });
  const agenda = {
    lastWeek: agendaClasses
      .filter((c) => c.scheduledDate >= prevWeekStart && c.scheduledDate < thisWeekStart)
      .map(mapClass),
    thisWeek: agendaClasses
      .filter((c) => c.scheduledDate >= thisWeekStart && c.scheduledDate <= thisWeekEnd)
      .map(mapClass),
  };

  return {
    generatedAt: now,
    matriculas: {
      totalActive,
      overdue,
      adults: { ...adults, total: totalAdults },
      kids: { ...kids, total: totalKids },
    },
    planos: [...byPlan.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    pagamento: [...byPayment.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count),
    cancelamentos: canceledCount,
    growth,
    salesMonthLabels: salesMonths.map((m) => format(m, "MMM/yy", { locale: ptBR })),
    sellerRanking,
    conversion,
    posExperimental,
    posExpLastWeek,
    agenda,
    // Receita (v1.1-AO): mensalidades recorrentes + aulas particulares.
    revenue: {
      monthlyRecurring,
      privateThisMonth: privateRevenue.thisMonth,
      privateAllTime: privateRevenue.allTime,
      privateActiveCount: privateRevenue.activeCount,
      globalThisMonth: monthlyRecurring + privateRevenue.thisMonth,
    },
  };
}

export type QuadroData = Awaited<ReturnType<typeof getQuadroData>>;
