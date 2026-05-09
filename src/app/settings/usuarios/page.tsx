import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { UsersEditor } from "./editor";

export default async function UsuariosPage() {
  const { tenant, user: actor } = await requireRole("ADMIN");

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          isSuperAdmin: true,
        },
      },
    },
  });

  return (
    <UsersEditor
      memberships={memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        active: m.active,
        emailVerified: m.user.emailVerified !== null,
        isSuperAdmin: m.user.isSuperAdmin,
      }))}
      currentUserId={actor.id}
    />
  );
}
