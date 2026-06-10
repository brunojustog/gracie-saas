import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { SiteWebhookForm } from "./form";

export default async function SiteWebhookPage() {
  const { tenant } = await requireRole("ADMIN");

  const data = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { siteWebhookSecret: true },
  });

  return (
    <SiteWebhookForm
      tenantSlug={tenant.slug}
      initial={{
        siteWebhookSecret: data?.siteWebhookSecret ?? "",
      }}
    />
  );
}
