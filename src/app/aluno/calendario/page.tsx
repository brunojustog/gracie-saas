import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { ageFromBirth, canAttend, type AlunoProfile } from "@/server/class-eligibility";
import { getAlunoDay } from "@/server/class-sessions";
import { requireAluno } from "@/server/tenant";

type SearchParams = Promise<{ date?: string }>;

const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, aluno } = await requireAluno();
  const sp = await searchParams;
  if (!aluno) {
    return (
      <main className="gb-shell" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Acesso não vinculado a um aluno.</p>
      </main>
    );
  }

  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();
  const selectedISO = format(selected, "yyyy-MM-dd");
  const monthStart = startOfMonth(selected);
  const monthEnd = endOfMonth(selected);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const [checkins, allDay, alunoRow] = await Promise.all([
    prisma.checkIn.findMany({
      where: {
        alunoId: aluno.id,
        present: true,
        session: { date: { gte: gridStart, lte: gridEnd } },
      },
      select: { session: { select: { date: true } } },
    }),
    getAlunoDay(tenant.id, aluno.id, selected),
    prisma.aluno.findUnique({
      where: { id: aluno.id },
      select: { lead: { select: { belt: true, beltDegree: true, gender: true, birthDate: true } } },
    }),
  ]);
  const profile: AlunoProfile = {
    belt: alunoRow?.lead.belt ?? null,
    grau: alunoRow?.lead.beltDegree ?? 0,
    age: ageFromBirth(alunoRow?.lead.birthDate ?? null, new Date()),
    gender: alunoRow?.lead.gender ?? null,
  };
  const day = allDay.filter((s) => canAttend(profile, s.label));
  const trained = new Set(
    checkins.map((c) => format(c.session.date, "yyyy-MM-dd")),
  );

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM-dd");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM-dd");

  return (
    <main className="gb-shell">
      <div className="gb-cal-head">
        <Link href={`/aluno?date=${selectedISO}`} className="gb-icon-btn" aria-label="Voltar">
          <ChevronLeft size={18} />
        </Link>
        <span className="gb-cal-title">Calendário</span>
        <Link href="/aluno" className="gb-icon-btn" aria-label="Fechar">
          <X size={18} />
        </Link>
      </div>

      <div className="gb-cal-month">
        <Link href={`/aluno/calendario?date=${prevMonth}`} className="gb-icon-btn" aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </Link>
        <span className="m" style={{ minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>
          {format(selected, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Link href={`/aluno/calendario?date=${nextMonth}`} className="gb-icon-btn" aria-label="Próximo mês">
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="gb-cal-grid">
        {DOW.map((d) => (
          <div key={d} className="gb-cal-dow">{d}</div>
        ))}
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const out = !isSameMonth(d, monthStart);
          const sel = iso === selectedISO;
          return (
            <Link
              key={iso}
              href={`/aluno/calendario?date=${iso}`}
              className={`gb-cal-cell${out ? " out" : ""}${sel ? " sel" : ""}`}
            >
              {format(d, "d")}
              <span className={`cdot${trained.has(iso) && !sel ? " treinou" : ""}`} />
            </Link>
          );
        })}
      </div>

      <div className="gb-legend">
        <span><i style={{ background: "var(--ok)" }} /> Treinou</span>
        <span><i style={{ background: "var(--future)" }} /> Aula futura</span>
        <span><i style={{ background: "var(--event)" }} /> Evento</span>
        <span><i style={{ background: "var(--muted-2)" }} /> Sem treino</span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, margin: "4px 2px 10px", textTransform: "capitalize" }}>
        {format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      </div>
      <div className="gb-daylist">
        {day.length === 0 ? (
          <div className="gb-empty">Nenhuma aula neste dia.</div>
        ) : (
          day.map((s) => {
            const present = s.myCheckin?.present ?? false;
            const pend = s.myCheckin != null && !present;
            return (
              <div key={s.id} className="drow">
                <span className={`st${present ? " done" : pend ? " pend" : ""}`}>
                  {present ? <Check size={13} color="#052e16" /> : null}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--muted)", width: 42 }}>{s.startTime}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                  {s.label}
                  {s.isKids ? <span className="gb-tag kids" style={{ marginLeft: 6 }}>Kids</span> : null}
                </span>
                {s.professorName ? (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.professorName}</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
