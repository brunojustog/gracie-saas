import { notFound } from "next/navigation";

import { formatBRL } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { CIELO_HOSTS, getSopAccessToken } from "@/server/cielo/client";
import { getTenantCielo, planFirstCharge } from "@/server/cielo/recurrence";

import { CardForm } from "./card-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

/**
 * Página pública (sem login) onde o aluno cadastra o cartão pra mensalidade
 * recorrente (v1.3-A). Link gerado em /matriculas, válido por 7 dias.
 */
export default async function CardPage({ params }: { params: Params }) {
  const { token } = await params;
  if (!token || token.length < 24) notFound();

  const enrollment = await prisma.enrollment.findUnique({
    where: { cieloCardLinkToken: token },
    select: {
      id: true,
      status: true,
      tenantId: true,
      monthlyValue: true,
      nextDueDate: true,
      cieloCardLinkExpiresAt: true,
      lead: { select: { name: true } },
      plan: { select: { name: true } },
      modality: { select: { name: true } },
      tenant: { select: { name: true, primaryColor: true, logoUrl: true } },
    },
  });

  const expired =
    !enrollment ||
    enrollment.status !== "ACTIVE" ||
    !enrollment.cieloCardLinkExpiresAt ||
    enrollment.cieloCardLinkExpiresAt < new Date();
  const cielo = enrollment ? await getTenantCielo(enrollment.tenantId) : null;

  if (expired || !cielo) {
    return (
      <Shell title={enrollment?.tenant.name ?? "Academia"} color={enrollment?.tenant.primaryColor}>
        <p className="text-sm text-muted-foreground">
          Este link expirou ou já foi usado. Peça um novo link na recepção da academia.
        </p>
      </Shell>
    );
  }

  // Produção exige Silent Order Post (cartão tokenizado no navegador).
  let mode: { kind: "sop"; accessToken: string; scriptUrl: string } | { kind: "sandbox" } | { kind: "unavailable" };
  if (cielo.sopClientId && cielo.sopClientSecret) {
    const sop = await getSopAccessToken({
      environment: cielo.environment,
      merchantId: cielo.merchantId,
      clientId: cielo.sopClientId,
      clientSecret: cielo.sopClientSecret,
    });
    mode = sop.ok
      ? { kind: "sop", accessToken: sop.data.accessToken, scriptUrl: CIELO_HOSTS[cielo.environment].sopScript }
      : cielo.environment === "sandbox"
        ? { kind: "sandbox" }
        : { kind: "unavailable" };
  } else {
    mode = cielo.environment === "sandbox" ? { kind: "sandbox" } : { kind: "unavailable" };
  }

  const first = planFirstCharge(enrollment.nextDueDate);
  const chargeInfo = first.authorizeNow
    ? "A primeira mensalidade é cobrada agora, e as próximas todo mês no mesmo dia."
    : `A primeira cobrança será em ${first.startDate.split("-").reverse().join("/")} e depois todo mês no mesmo dia.`;

  return (
    <Shell title={enrollment.tenant.name} color={enrollment.tenant.primaryColor} sandbox={cielo.environment === "sandbox"}>
      <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Aluno: </span>
          <b>{enrollment.lead.name}</b>
        </div>
        <div>
          <span className="text-muted-foreground">Plano: </span>
          {enrollment.modality.name} · {enrollment.plan.name}
        </div>
        <div>
          <span className="text-muted-foreground">Mensalidade: </span>
          <b>{formatBRL(Number(enrollment.monthlyValue))}</b>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">{chargeInfo}</p>
      </div>

      {mode.kind === "unavailable" ? (
        <p className="text-sm text-destructive">
          Cadastro de cartão temporariamente indisponível. Avise a recepção da academia.
        </p>
      ) : (
        <CardForm
          token={token}
          mode={mode.kind}
          environment={cielo.environment}
          sopAccessToken={mode.kind === "sop" ? mode.accessToken : undefined}
          sopScriptUrl={mode.kind === "sop" ? mode.scriptUrl : undefined}
          color={enrollment.tenant.primaryColor}
        />
      )}
    </Shell>
  );
}

function Shell({
  title,
  color,
  sandbox,
  children,
}: {
  title: string;
  color?: string | null;
  sandbox?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <header className="space-y-1 border-b pb-3">
          <div className="h-1.5 w-12 rounded-full" style={{ background: color ?? "#C8102E" }} aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">Cadastro do cartão para a mensalidade</p>
          {sandbox ? (
            <p className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              AMBIENTE DE TESTES (sandbox) — use só cartões de teste; nenhuma cobrança é real.
            </p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
