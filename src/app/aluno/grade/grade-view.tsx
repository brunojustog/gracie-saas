"use client";

import { CalendarDays, Dumbbell, Home, Lock, MapPin, User, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type GradeClass = {
  startTime: string;
  label: string;
  professorName: string | null;
  nivel: string;
  elegivel: boolean;
};
type GradeDay = { dow: string; classes: GradeClass[] };

export function GradeView({
  days,
  signOutSlot,
}: {
  days: GradeDay[];
  signOutSlot: ReactNode;
}) {
  return (
    <>
      <main className="gb-shell">
        <div className="gb-cal-head">
          <Link href="/aluno" className="gb-icon-btn" aria-label="Voltar"><Home size={18} /></Link>
          <span className="gb-cal-title">Grade da semana</span>
          <span style={{ width: 38 }} />
        </div>

        <p style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", margin: "2px 0 14px" }}>
          Todas as aulas da semana. O <b>check-in</b> fica liberado só nas aulas
          do seu nível — as demais aparecem para você acompanhar a grade.
        </p>

        {days.length === 0 ? (
          <div className="gb-empty">Nenhuma aula cadastrada na grade ainda.</div>
        ) : (
          days.map((d) => (
            <div key={d.dow} className="gb-sec">
              <div className="gb-sec-h"><h2>{d.dow}</h2></div>
              {d.classes.map((c, i) => (
                <div key={i} className={`gb-class${!c.elegivel ? " locked" : ""}`}>
                  <div className="ico"><Dumbbell size={18} color="var(--red)" /></div>
                  <div className="mid">
                    <div className="time">{c.startTime} · {c.nivel}</div>
                    <div className="ttl"><span className="prog">{c.label}</span></div>
                    {c.professorName ? <div className="prof">{c.professorName}</div> : null}
                  </div>
                  {c.elegivel ? (
                    <span className="gb-tag" style={{ background: "var(--ok, #16a34a)", color: "#fff" }}>liberada</span>
                  ) : (
                    <span className="gb-lock"><Lock size={13} /> outra faixa</span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        <Link href="/aluno/checkin" className="gb-cta" style={{ textDecoration: "none", marginTop: 6 }}>
          <MapPin size={20} />
          <span className="t"><b>FAZER CHECK-IN</b><span>Registrar presença nas aulas de hoje</span></span>
        </Link>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>{signOutSlot}</div>
      </main>

      <nav className="gb-nav">
        <div className="inner">
          <Link href="/aluno" style={btnReset as React.CSSProperties}><span className="cico"><Home size={19} /></span>Início</Link>
          <a className="on" href="/aluno/grade"><span className="cico"><CalendarDays size={19} /></span>Grade</a>
          <Link href="/aluno/checkin" style={btnReset as React.CSSProperties}><span className="cico"><MapPin size={19} /></span>Check-in</Link>
          <Link href="/aluno/financeiro" style={btnReset as React.CSSProperties}><span className="cico"><Wallet size={19} /></span>Financeiro</Link>
          <Link href="/aluno/perfil" style={btnReset as React.CSSProperties}><span className="cico"><User size={19} /></span>Perfil</Link>
        </div>
      </nav>
    </>
  );
}

const btnReset: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  padding: "9px 0", background: "none", border: 0, color: "var(--muted-2)",
  fontSize: 10, fontWeight: 600, cursor: "pointer",
};
