import { redirect } from "next/navigation";

import { roleAtLeast } from "@/server/rbac";
import { requireRole } from "@/server/tenant";

export default async function SettingsIndexPage() {
  // v1.1-AH: landing por role — ADMIN cai na primeira página do menu dele;
  // SELLER/MANAGER caem em Planos (única página que enxergam).
  const { membership } = await requireRole("SELLER");
  redirect(
    roleAtLeast(membership.role, "ADMIN")
      ? "/settings/modalidades"
      : "/settings/planos",
  );
}
