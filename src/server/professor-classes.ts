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

  const [mySlots, taughtToday, myParticulares, professors] = await Promise.all([
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
    professors,
  };
}

/** Ganhos do professor no período (regular/kids como titular + auxílios + particulares). */
export async function getProfessorEarnings(
  tenantId: string,
  professorId: string,
  from: Date,
  to: Date,
) {
  const [asTitular, asAux, particulares] = await Promise.all([
    prisma.taughtClass.findMany({
      where: { tenantId, professorId, status: "CONFIRMED", date: { gte: from, lte: to } },
      select: { value: true },
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
  return {
    regularCount: asTitular.length,
    regularValor,
    auxCount: asAux,
    auxValor,
    particularCount: particulares.length,
    particularValor,
    total: regularValor + auxValor + particularValor,
  };
}

/** Fechamento por professor (aba do Anderson) — todos os professores no período. */
export async function getProfessorClosing(tenantId: string, from: Date, to: Date) {
  const professors = await prisma.professor.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });
  const rows = await Promise.all(
    professors.map(async (p) => ({
      professorId: p.id,
      professorName: p.name,
      active: p.active,
      ...(await getProfessorEarnings(tenantId, p.id, from, to)),
    })),
  );
  // Só mostra quem teve alguma aula no período.
  const withActivity = rows.filter(
    (r) => r.regularCount + r.auxCount + r.particularCount > 0,
  );
  const totalGeral = withActivity.reduce((s, r) => s + r.total, 0);
  return { rows: withActivity, totalGeral };
}
