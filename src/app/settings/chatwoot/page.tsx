import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { ChatwootForm } from "./form";

export default async function ChatwootPage() {
  const { tenant } = await requireRole("ADMIN");

  const data = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      slug: true,
      chatwootUrl: true,
      chatwootAccountId: true,
      chatwootApiToken: true,
      chatwootWebhookSecret: true,
    },
  });

  return (
    <ChatwootForm
      tenantSlug={tenant.slug}
      initial={{
        chatwootUrl: data?.chatwootUrl ?? "",
        chatwootAccountId: data?.chatwootAccountId ?? null,
        chatwootApiToken: data?.chatwootApiToken ?? "",
        chatwootWebhookSecret: data?.chatwootWebhookSecret ?? "",
      }}
    />
  );
}
