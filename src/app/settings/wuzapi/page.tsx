import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { WuzapiForm } from "./form";

export default async function WuzapiPage() {
  const { tenant } = await requireRole("ADMIN");

  const data = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      wuzapiUrl: true,
      wuzapiToken: true,
      followUpEnabled: true,
    },
  });

  return (
    <WuzapiForm
      initial={{
        wuzapiUrl: data?.wuzapiUrl ?? "",
        wuzapiToken: data?.wuzapiToken ?? "",
        followUpEnabled: data?.followUpEnabled ?? false,
      }}
    />
  );
}
