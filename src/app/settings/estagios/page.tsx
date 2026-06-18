import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { StagesEditor } from "./editor";

export default async function EstagiosPage() {
  const { tenant } = await requireRole("ADMIN");

  const stages = await prisma.stage.findMany({
    where: { tenantId: tenant.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      order: true,
      isWon: true,
      isLost: true,
      isScheduling: true,
      isAttendance: true,
      isPrivate: true,
      active: true,
    },
  });

  return <StagesEditor stages={stages} />;
}
