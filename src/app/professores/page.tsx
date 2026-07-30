import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { ExpPeriodFilter } from "@/app/quadro/exp-period-filter";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import { signOut } from "@/server/auth";
import { getProfessorClosing } from "@/server/professor-classes";
import { requireRole } from "@/server/tenant";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{ period?: string; from?: string; to?: string }>;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProfessoresFechamentoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, membership } = await requireRole("ADMIN");
  const sp = await searchParams;

  const custom = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const period = custom ?? resolvePreset(preset);
  const selector: PeriodPreset | "custom" = custom ? "custom" : preset;

  const { rows, totalGeral } = await getProfessorClosing(
    tenant.id,
    period.from,
    period.to,
  );

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
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Fechamento por professor
            </h1>
            <p className="text-xs text-muted-foreground">
              Aulas confirmadas no período · {period.label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/professor"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              Minhas aulas
            </Link>
            <ExpPeriodFilter current={selector} from={sp.from} to={sp.to} />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhuma aula confirmada no período.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Professor</th>
                  <th className="px-3 py-2 text-right font-medium">Regulares</th>
                  <th className="px-3 py-2 text-right font-medium">Auxílios</th>
                  <th className="px-3 py-2 text-right font-medium">Particulares</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.professorId} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2 font-medium">
                      {r.professorName}
                      {!r.active ? (
                        <span className="ml-1 rounded bg-muted px-1 text-[10px]">inativo</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.regularCount}× · {brl(r.regularValor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.auxCount}× · {brl(r.auxValor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.particularCount}× · {brl(r.particularValor)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
                      {brl(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td className="px-3 py-2 font-semibold" colSpan={4}>
                    Total geral a repassar
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                    {brl(totalGeral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Regular = aula da grade dada (valor do slot). Auxílio = professor
          auxiliar em aula KIDS ({brl(35)}). Particular = 60% da aula (90% no
          cartão). Só conta aula com check.
        </p>
      </main>
    </>
  );
}
