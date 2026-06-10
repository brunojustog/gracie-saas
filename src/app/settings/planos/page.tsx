import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { PlansEditor } from "./editor";

export default async function PlanosPage() {
  // v1.1-AH: SELLER gerencia planos (espelha o requireRole da action).
  const { tenant } = await requireRole("SELLER");

  const [plans, modalities] = await Promise.all([
    prisma.plan.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { monthlyValue: "asc" }],
      include: { modality: { select: { id: true, name: true } } },
    }),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PlansEditor
      plans={plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        monthlyValue: Number(p.monthlyValue),
        setupFee: p.setupFee ? Number(p.setupFee) : null,
        modalityId: p.modalityId,
        modalityName: p.modality?.name ?? null,
        active: p.active,
      }))}
      modalities={modalities}
    />
  );
}
