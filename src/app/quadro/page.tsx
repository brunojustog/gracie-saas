import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getRecentSnapshots } from "@/server/daily-report";
import { getQuadroData, getRangeResumo, type RangeResumo } from "@/server/quadro";
import { requireRole } from "@/server/tenant";

import { PublicLinkButton } from "./public-link-button";
import { QuadroBody } from "./quadro-view";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

const VALID_DAYS = [7, 14, 30] as const;

type SearchParams = Promise<{
  period?: string;
  from?: string;
  to?: string;
  // v1.1-CG: resumo por período (datas próprias) + nº de dias da faixa.
  rfrom?: string;
  rto?: string;
  days?: string;
}>;

export default async function QuadroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Admin-only. requireRole redireciona quem não for ADMIN pra /dashboard.
  const { tenant, user, membership } = await requireRole("ADMIN");
  const sp = await searchParams;

  // Período da segmentação de experimentais. Default = mês atual.
  const customPeriod = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const expPeriod = customPeriod ?? resolvePreset(preset);
  const expSelector: PeriodPreset | "custom" = customPeriod ? "custom" : preset;

  // v1.1-CG: faixa de dias (7 padrão).
  const daysNum = VALID_DAYS.includes(Number(sp.days) as (typeof VALID_DAYS)[number])
    ? Number(sp.days)
    : 7;

  // v1.1-CG: resumo por período (só quando as duas datas vêm).
  const rangePeriod = sp.rfrom && sp.rto ? resolveCustom(sp.rfrom, sp.rto) : null;

  const [data, tenantRow, snapshots, rangeResumo] = await Promise.all([
    getQuadroData(tenant.id, expPeriod),
    prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { publicQuadroToken: true },
    }),
    getRecentSnapshots(tenant.id, daysNum),
    rangePeriod
      ? getRangeResumo(tenant.id, rangePeriod.from, rangePeriod.to, rangePeriod.label)
      : (Promise.resolve(null) as Promise<RangeResumo | null>),
  ]);

  return (
    <>
      <TopNav
        tenantName={tenant.name}
        tenantColor={tenant.primaryColor}
        userEmail={user.email}
        role={membership.role}
        signOutSlot={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Sair
            </Button>
          </form>
        }
      />
      <QuadroBody
        data={data}
        expSelector={expSelector}
        from={sp.from}
        to={sp.to}
        dailySnapshots={snapshots}
        dailyDays={daysNum}
        rangeResumo={rangeResumo}
        rangeFrom={sp.rfrom}
        rangeTo={sp.rto}
        shareSlot={<PublicLinkButton token={tenantRow?.publicQuadroToken ?? null} />}
      />
    </>
  );
}
