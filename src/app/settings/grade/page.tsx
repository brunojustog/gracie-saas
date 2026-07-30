import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { GradeEditor } from "./editor";

export default async function GradePage() {
  const { tenant } = await requireRole("ADMIN");

  const [slots, professors] = await Promise.all([
    prisma.classGridSlot.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        professorId: true,
        dayOfWeek: true,
        startTime: true,
        label: true,
        isKids: true,
        value: true,
        active: true,
        professor: { select: { name: true } },
      },
    }),
    prisma.professor.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <GradeEditor
      slots={slots.map((s) => ({
        id: s.id,
        professorId: s.professorId,
        professorName: s.professor.name,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        label: s.label,
        isKids: s.isKids,
        value: Number(s.value),
        active: s.active,
      }))}
      professors={professors}
    />
  );
}
