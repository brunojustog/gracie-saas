import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ProfessorsEditor } from "./editor";

export default async function ProfessoresPage() {
  const { tenant } = await requireRole("ADMIN");

  const professors = await prisma.professor.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });

  return <ProfessorsEditor professors={professors} />;
}
