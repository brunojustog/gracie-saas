/**
 * v1.1-CB: controle de aulas dos professores.
 *
 * - Grade PADRÃO (ClassGridSlot) = cardápio recorrente por dia da semana.
 * - Aula dada (TaughtClass) = o professor deu "check" numa aula da grade (ou
 *   numa extra). Transferência = a aula muda de professor (titular vira
 *   referência). Aula KIDS pede um auxiliar (recebe AUX_VALUE).
 * - Aula PARTICULAR não entra aqui — fica em PrivateSession; o valor do
 *   professor é calculado à parte (server/quadro.professorShareForSession).
 */
import { endOfDay, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { professorShareForSession } from "@/server/quadro";

/** Valor pago ao professor AUXILIAR de uma aula KIDS. */
export const AUX_VALUE = 35;

/** v1.1-CH: bonificação de conversão = 1,5× a hora-aula do professor. */
export const CONVERSION_MULTIPLIER = 1.5;

/**
 * v1.1-CH: matrículas do período que vieram de experimental, atribuídas ao
 * PROFESSOR da experimental (a mais recente ATTENDED com professor). Cada
 * matrícula conta pra UM professor só (não duplica). Bônus = 1,5× hora-aula.
 */
export async function getConversionMap(tenantId: string, from: Date, to: Date) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId,
      enrolledAt: { gte: from, lte: to },
      lead: {
        deletedAt: null,
        experimentalClasses: { some: { status: "ATTENDED", professorId: { not: null } } },
      },
    },
    select: {
      id: true,
      enrolledAt: true,
      lead: {
        select: {
          name: true,
          experimentalClasses: {
            where: { status: "ATTENDED", professorId: { not: null } },
            orderBy: { scheduledDate: "desc" },
            take: 1,
            select: {
              professor: { select: { id: true, name: true, hourlyRate: true } },
            },
          },
        },
      },
    },
  });

  const map = new Map<
    string,
    { professorName: string; count: number; valor: number; alunos: { nome: string; data: Date }[] }
  >();
  for (const e of enrollments) {
    const prof = e.lead.experimentalClasses[0]?.professor;
    if (!prof) continue;
    const row = map.get(prof.id) ?? {
      professorName: prof.name,
      count: 0,
      valor: 0,
      alunos: [],
    };
    row.count++;
    row.valor += Number(prof.hourlyRate) * CONVERSION_MULTIPLIER;
    row.alunos.push({ nome: e.lead.name, data: e.enrolledAt });
    map.set(prof.id, row);
  }
  return map;
}

/** JS getDay() 0=Dom..6=Sáb → ISO 1=Seg..7=Dom (como guardamos no slot). */
export function isoDayOfWeek(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** Aulas do dia pra UM professor: grade + confirmadas + transferidas + particulares. */
export async function getProfessorDay(
  tenantId: string,
  professorId: string,
  date: Date,
) {
  const day = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dow = isoDayOfWeek(date);

  const [mySlots, taughtToday, myParticulares, myExperimentais, professors] =
    await Promise.all([
    prisma.classGridSlot.findMany({
      where: { tenantId, professorId, dayOfWeek: dow, active: true },
      orderBy: { startTime: "asc" },
    }),
    // Todas as aulas dadas HOJE no tenant (pra saber o status de cada slot +
    // as transferidas pra mim).
    prisma.taughtClass.findMany({
      where: { tenantId, date: day },
      include: {
        professor: { select: { id: true, name: true } },
        auxProfessor: { select: { id: true, name: true } },
      },
    }),
    prisma.privateSession.findMany({
      where: {
        professorId,
        completedAt: null,
        scheduledDate: { gte: day, lte: dayEnd },
        package: { tenantId, lead: { deletedAt: null } },
      },
      select: {
        id: true,
        scheduledDate: true,
        package: { select: { id: true, lead: { select: { name: true } } } },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    // v1.1-CH: experimentais atribuídas a mim nesse dia (individual/grupo).
    prisma.experimentalClass.findMany({
      where: {
        tenantId,
        professorId,
        status: { not: "CANCELED" },
        scheduledDate: { gte: day, lte: dayEnd },
        lead: { deletedAt: null },
      },
      select: {
        id: true,
        scheduledDate: true,
        status: true,
        kind: true,
        lead: { select: { name: true } },
        modality: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.professor.findMany({
      where: { tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const bySlot = new Map(
    taughtToday.filter((t) => t.gridSlotId).map((t) => [t.gridSlotId!, t]),
  );

  // Aulas da MINHA grade hoje, com o status.
  const gridItems = mySlots.map((s) => {
    const taught = bySlot.get(s.id) ?? null;
    return {
      slotId: s.id,
      startTime: s.startTime,
      label: s.label,
      isKids: s.isKids,
      value: Number(s.value),
      taught: taught
        ? {
            id: taught.id,
            professorId: taught.professorId,
            professorName: taught.professor.name,
            status: taught.status,
            auxProfessorId: taught.auxProfessorId,
            auxProfessorName: taught.auxProfessor?.name ?? null,
            mine: taught.professorId === professorId,
          }
        : null,
    };
  });

  // Aulas transferidas PRA MIM (professor=me, mas o slot é de outro titular).
  const mySlotIds = new Set(mySlots.map((s) => s.id));
  const incoming = taughtToday
    .filter(
      (t) =>
        t.professorId === professorId &&
        (!t.gridSlotId || !mySlotIds.has(t.gridSlotId)),
    )
    .map((t) => ({
      id: t.id,
      startTime: t.startTime,
      label: t.label,
      isKids: t.isKids,
      value: Number(t.value),
      status: t.status,
      titularProfessorId: t.titularProfessorId,
      auxProfessorId: t.auxProfessorId,
      auxProfessorName: t.auxProfessor?.name ?? null,
    }));

  return {
    date: day,
    gridItems,
    incoming,
    particulares: myParticulares.map((p) => ({
      sessionId: p.id,
      packageId: p.package.id,
      alunoNome: p.package.lead.name,
    })),
    experimentais: myExperimentais.map((e) => ({
      id: e.id,
      alunoNome: e.lead.name,
      modality: e.modality.name,
      kind: e.kind as "INDIVIDUAL" | "GROUP",
      status: e.status,
      attended: e.status === "ATTENDED",
    })),
    professors,
  };
}

/** Ganhos do professor no período (regular/kids como titular + auxílios + particulares + conversões). */
export async function getProfessorEarnings(
  tenantId: string,
  professorId: string,
  from: Date,
  to: Date,
  /** v1.1-CH: conversões pré-calculadas (evita recomputar por professor). */
  conversion?: { count: number; valor: number },
) {
  const conv =
    conversion ??
    (await getConversionMap(tenantId, from, to)).get(professorId) ??
    { count: 0, valor: 0 };
  const convCount = conv.count;
  const convValor = conv.valor;
  const [asTitular, asAux, particulares] = await Promise.all([
    prisma.taughtClass.findMany({
      where: { tenantId, professorId, status: "CONFIRMED", date: { gte: from, lte: to } },
      select: { value: true, label: true },
    }),
    prisma.taughtClass.count({
      where: { tenantId, auxProfessorId: professorId, status: "CONFIRMED", date: { gte: from, lte: to } },
    }),
    prisma.privateSession.findMany({
      where: {
        professorId,
        completedAt: { gte: from, lte: to },
        package: { tenantId, lead: { deletedAt: null } },
      },
      select: {
        package: { select: { value: true, totalClasses: true, paymentMethod: true } },
      },
    }),
  ]);

  const regularValor = asTitular.reduce((s, t) => s + Number(t.value), 0);
  const auxValor = asAux * AUX_VALUE;
  const particularValor = particulares.reduce(
    (s, p) => s + professorShareForSession(p.package),
    0,
  );

  // v1.1-CE: quebra por modalidade (pra gráfico de pizza + lista de valores).
  const modMap = new Map<string, { count: number; valor: number }>();
  for (const t of asTitular) {
    const cur = modMap.get(t.label) ?? { count: 0, valor: 0 };
    cur.count++;
    cur.valor += Number(t.value);
    modMap.set(t.label, cur);
  }
  const byModality = [...modMap.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count);
  if (asAux > 0) byModality.push({ label: "Auxílio", count: asAux, valor: auxValor });
  if (particulares.length > 0) {
    byModality.push({
      label: "Particular",
      count: particulares.length,
      valor: particularValor,
    });
  }
  if (convCount > 0) {
    byModality.push({ label: "Experimentais convertidas", count: convCount, valor: convValor });
  }

  return {
    regularCount: asTitular.length,
    regularValor,
    auxCount: asAux,
    auxValor,
    particularCount: particulares.length,
    particularValor,
    convCount,
    convValor,
    total: regularValor + auxValor + particularValor + convValor,
    byModality,
  };
}

/**
 * v1.1-CE: projeção do mês a partir da GRADE PADRÃO — quantas aulas cada
 * modalidade/professor vai ter no mês (contando as ocorrências de cada slot
 * pelos dias da semana) e o valor estimado. Feriados são ajuste manual (fora
 * do cálculo). Não desconta o que já foi dado — é a projeção cheia do padrão.
 */
export async function getMonthProjection(
  tenantId: string,
  monthStart: Date,
  monthEnd: Date,
) {
  const slots = await prisma.classGridSlot.findMany({
    where: { tenantId, active: true },
    select: {
      professorId: true,
      dayOfWeek: true,
      label: true,
      isKids: true,
      value: true,
      professor: { select: { name: true } },
    },
  });

  // Quantas vezes cada dia-da-semana (ISO 1..7) aparece no mês.
  const dowCount: Record<number, number> = {};
  for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
    const iso = isoDayOfWeek(d);
    dowCount[iso] = (dowCount[iso] ?? 0) + 1;
  }

  const byModality = new Map<string, { count: number; valor: number }>();
  const byProfessor = new Map<
    string,
    { professorName: string; count: number; valor: number }
  >();
  let totalCount = 0;
  let totalValor = 0;

  for (const s of slots) {
    const occ = dowCount[s.dayOfWeek] ?? 0;
    if (occ === 0) continue;
    const valor = occ * Number(s.value);
    totalCount += occ;
    totalValor += valor;

    const m = byModality.get(s.label) ?? { count: 0, valor: 0 };
    m.count += occ;
    m.valor += valor;
    byModality.set(s.label, m);

    const p = byProfessor.get(s.professorId) ?? {
      professorName: s.professor.name,
      count: 0,
      valor: 0,
    };
    p.count += occ;
    p.valor += valor;
    byProfessor.set(s.professorId, p);
  }

  return {
    totalCount,
    totalValor,
    byModality: [...byModality.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.count - a.count),
    byProfessor: [...byProfessor.entries()]
      .map(([professorId, v]) => ({ professorId, ...v }))
      .sort((a, b) => b.valor - a.valor),
  };
}

/** Fechamento por professor (aba do Anderson) — todos os professores no período. */
export async function getProfessorClosing(
  tenantId: string,
  from: Date,
  to: Date,
  professorId?: string,
) {
  const [professors, conversionMap] = await Promise.all([
    prisma.professor.findMany({
      where: { tenantId, ...(professorId ? { id: professorId } : {}) },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    getConversionMap(tenantId, from, to),
  ]);
  const rows = await Promise.all(
    professors.map(async (p) => ({
      professorId: p.id,
      professorName: p.name,
      active: p.active,
      ...(await getProfessorEarnings(
        tenantId,
        p.id,
        from,
        to,
        conversionMap.get(p.id) ?? { count: 0, valor: 0 },
      )),
    })),
  );
  // Só mostra quem teve alguma aula no período.
  const withActivity = rows.filter(
    (r) => r.regularCount + r.auxCount + r.particularCount > 0,
  );
  const totalGeral = withActivity.reduce((s, r) => s + r.total, 0);
  return { rows: withActivity, totalGeral };
}

/** v1.1-CE: aulas dadas (TaughtClass) no período pro Anderson gerenciar. */
export async function getTaughtClassesForAdmin(
  tenantId: string,
  from: Date,
  to: Date,
  professorId?: string,
) {
  const rows = await prisma.taughtClass.findMany({
    where: {
      tenantId,
      date: { gte: from, lte: to },
      ...(professorId
        ? { OR: [{ professorId }, { auxProfessorId: professorId }] }
        : {}),
    },
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      label: true,
      isKids: true,
      value: true,
      status: true,
      professor: { select: { id: true, name: true } },
      auxProfessor: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.startTime,
    label: r.label,
    isKids: r.isKids,
    value: Number(r.value),
    status: r.status,
    professorId: r.professor.id,
    professorName: r.professor.name,
    auxProfessorId: r.auxProfessor?.id ?? null,
    auxProfessorName: r.auxProfessor?.name ?? null,
  }));
}
