import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ProfessorsEditor } from "./editor";

export default async function ProfessoresPage() {
  const { tenant } = await requireRole("ADMIN");

  const [professors, members] = await Promise.all([
    prisma.professor.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true, email: true, userId: true, hourlyRate: true },
    }),
    // Usuários do tenant (pra vincular o login do professor). Admin/professor.
    prisma.tenantUser.findMany({
      where: { tenantId: tenant.id, active: true, role: { in: ["PROFESSOR", "ADMIN"] } },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <ProfessorsEditor
      professors={professors.map((p) => ({ ...p, hourlyRate: Number(p.hourlyRate) }))}
      members={members.map((m) => ({
        userId: m.userId,
        label: `${m.user.name ?? m.user.email}${m.role === "ADMIN" ? " (admin)" : ""}`,
        email: m.user.email,
      }))}
    />
  );
}
