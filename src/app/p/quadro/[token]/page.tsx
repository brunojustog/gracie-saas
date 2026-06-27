import { notFound } from "next/navigation";

import { resolvePreset } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { getRecentSnapshots } from "@/server/daily-report";
import { getQuadroData } from "@/server/quadro";

import { QuadroBody } from "@/app/quadro/quadro-view";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/**
 * Visão pública (read-only, sem login) do Quadro do Vitor (v1.1-BF).
 * Resolve o tenant pelo token; NUNCA mostra números financeiros (publicMode).
 */
export default async function PublicQuadroPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const tenant = await prisma.tenant.findFirst({
    where: { publicQuadroToken: token, active: true },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  const expPeriod = resolvePreset("this_month");
  const [data, snapshots] = await Promise.all([
    getQuadroData(tenant.id, expPeriod),
    getRecentSnapshots(tenant.id, 7),
  ]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3">
          <span className="font-semibold tracking-tight">{tenant.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Visão gerencial · somente leitura
          </span>
        </div>
      </header>
      <QuadroBody data={data} expSelector="this_month" publicMode dailySnapshots={snapshots} />
    </div>
  );
}
