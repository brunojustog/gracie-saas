import { getExamSchedule, EXAM_WINDOW } from "@/server/graduation-exams";
import { requireProfessor } from "@/server/tenant";

const beltLabel = (belt: string | null, grau: number | null) =>
  belt ? `${belt}${grau ? ` ${grau}º` : ""}` : "faixa a definir";

const ddmm = (dateStr: string) => {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
};

export default async function ProfessorProvasPage() {
  const { tenant } = await requireProfessor();
  const schedule = await getExamSchedule(tenant.id);

  const daysWithExams = schedule
    .map((d) => ({ ...d, booked: d.slots.filter((s) => s.exam) }))
    .filter((d) => d.booked.length > 0);

  const total = daysWithExams.reduce((s, d) => s + d.booked.length, 0);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Provas de graduação</h1>
        <p className="text-sm text-muted-foreground">
          Provas agendadas ({ddmm(EXAM_WINDOW.start)}–{ddmm(EXAM_WINDOW.end)}) ·{" "}
          {total} no total.
        </p>
      </div>

      {daysWithExams.length === 0 ? (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma prova agendada ainda.
        </p>
      ) : (
        <div className="space-y-4">
          {daysWithExams.map((day) => (
            <section key={day.dateStr} className="rounded-xl border border-border bg-card">
              <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
                <span className="font-semibold">{day.label}</span>
                <span className="text-xs text-muted-foreground">{ddmm(day.dateStr)}</span>
              </div>
              <ul className="divide-y divide-border">
                {day.booked.map((slot) => (
                  <li key={slot.iso} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium">{slot.exam!.alunoNome}</div>
                      <div className="text-xs text-muted-foreground">
                        → {beltLabel(slot.exam!.targetBelt, slot.exam!.targetBeltDegree)}
                        {slot.exam!.notes ? ` · ${slot.exam!.notes}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums">
                      {slot.time}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
