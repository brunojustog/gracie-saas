import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ManychatForm } from "./form";

export default async function ManychatPage() {
  const { tenant } = await requireRole("ADMIN");

  const data = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { manychatWebhookSecret: true },
  });

  return (
    <ManychatForm
      tenantSlug={tenant.slug}
      initial={{
        manychatWebhookSecret: data?.manychatWebhookSecret ?? "",
      }}
    />
  );
}
