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
        createdAt: true,
        user: { select: { email: true } },
        lead: { select: { name: true, phone: true, belt: true, beltDegree: true } },
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
        phone: a.lead.phone,
        email: a.user?.email ?? null,
        matricula: a.matricula,
        belt: a.lead.belt,
        beltDegree: a.lead.beltDegree,
        active: a.active,
        createdAtISO: a.createdAt.toISOString(),
      }))}
      location={{
        latitude: tenantRow?.latitude != null ? Number(tenantRow.latitude) : null,
        longitude: tenantRow?.longitude != null ? Number(tenantRow.longitude) : null,
        radiusMeters: tenantRow?.checkinRadiusMeters ?? 6000,
      }}
    />
  );
}
