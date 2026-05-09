import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ModalitiesEditor } from "./editor";

export default async function ModalidadesPage() {
  const { tenant } = await requireRole("ADMIN");

  const modalities = await prisma.modality.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <ModalitiesEditor
      modalities={modalities.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        ageRange: m.ageRange,
        color: m.color,
        active: m.active,
      }))}
    />
  );
}
