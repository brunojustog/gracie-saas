import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { AlunosEditor } from "./editor";

export default async function AlunosSettingsPage() {
  const { tenant } = await requireRole("ADMIN");

  const [alunos, tenantRow] = await Promise.all([
    prisma.aluno.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        matricula: true,
        active: true,
        user: { select: { email: true } },
        lead: { select: { name: true, belt: true, beltDegree: true } },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { latitude: true, longitude: true, checkinRadiusMeters: true },
    }),
  ]);

  return (
    <AlunosEditor
      alunos={alunos.map((a) => ({
        id: a.id,
        nome: a.lead.name,
        email: a.user?.email ?? null,
        matricula: a.matricula,
        belt: a.lead.belt,
        beltDegree: a.lead.beltDegree,
        active: a.active,
      }))}
      location={{
        latitude: tenantRow?.latitude != null ? Number(tenantRow.latitude) : null,
        longitude: tenantRow?.longitude != null ? Number(tenantRow.longitude) : null,
        radiusMeters: tenantRow?.checkinRadiusMeters ?? 6000,
      }}
    />
  );
}
