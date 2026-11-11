import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { CieloForm } from "./form";

export default async function CieloPage() {
  const { tenant } = await requireRole("ADMIN");

  const data = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      slug: true,
      cieloEnvironment: true,
      cieloMerchantId: true,
      cieloMerchantKey: true,
      cieloSopClientId: true,
      cieloSopClientSecret: true,
      cieloWebhookSecret: true,
      cieloSoftDescriptor: true,
    },
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/webhooks/cielo/${data?.slug ?? tenant.slug}`;

  return (
    <CieloForm
      webhookUrl={webhookUrl}
      initial={{
        cieloEnvironment: (data?.cieloEnvironment as "sandbox" | "production" | null) ?? null,
        cieloMerchantId: data?.cieloMerchantId ?? "",
        hasMerchantKey: Boolean(data?.cieloMerchantKey),
        cieloSopClientId: data?.cieloSopClientId ?? "",
        hasSopClientSecret: Boolean(data?.cieloSopClientSecret),
        cieloWebhookSecret: data?.cieloWebhookSecret ?? "",
        cieloSoftDescriptor: data?.cieloSoftDescriptor ?? "",
      }}
    />
  );
}
