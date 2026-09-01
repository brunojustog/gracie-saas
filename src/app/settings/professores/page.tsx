import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ProfessorsEditor } from "./editor";

export default async function ProfessoresPage() {
  const { tenant } = await requireRole("ADMIN");

  const [professors, members, slotCounts] = await Promise.all([
    prisma.professor.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true, email: true, userId: true, hourlyRate: true, isOwner: true },
    }),
    // Usuários do tenant (pra vincular o login do professor). Admin/professor.
    prisma.tenantUser.findMany({
      where: { tenantId: tenant.id, active: true, role: { in: ["PROFESSOR", "ADMIN"] } },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
    // v1.2-F: aulas ativas na grade por professor (pra avisar na inativação).
    prisma.classGridSlot.groupBy({
      by: ["professorId"],
      where: { tenantId: tenant.id, active: true },
      _count: true,
    }),
  ]);

  const slotMap = new Map(slotCounts.map((s) => [s.professorId, s._count]));

  return (
    <ProfessorsEditor
      professors={professors.map((p) => ({
        ...p,
        hourlyRate: Number(p.hourlyRate),
        activeSlots: slotMap.get(p.id) ?? 0,
      }))}
      members={members.map((m) => ({
        userId: m.userId,
        label: `${m.user.name ?? m.user.email}${m.role === "ADMIN" ? " (admin)" : ""}`,
        email: m.user.email,
      }))}
    />
  );
}
