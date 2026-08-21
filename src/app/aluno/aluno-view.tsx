"use client";

import {
  Bell,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Home,
  Loader2,
  MapPin,
  Undo2,
  User,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import type { AlunoSession, WeekDay } from "@/server/class-sessions";

import { checkInToSession, undoCheckIn } from "./actions";

type TimelineItem = {
  id: string; belt: string; beltDegree: number; graduatedAtISO: string;
  note: string | null; professorName: string | null; hasPhoto: boolean;
};
type WeekDayStrip = {
  iso: string; dow: string; num: string; trained: boolean; isToday: boolean; isSelected: boolean;
};

const BELT_BG: Record<string, string> = {
  branca: "var(--f-branca)", cinza: "var(--f-cinza)", amarela: "var(--f-amarela)",
  laranja: "var(--f-laranja)", verde: "var(--f-verde)", azul: "var(--f-azul)",
  roxa: "var(--f-roxa)", marrom: "var(--f-marrom)", preta: "var(--f-preta)",
};

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export function AlunoView({
  alunoName, matricula, belt, beltDegree, dateISO, dateLabel, day,
  weekStrip, hasGeofence, progress, timeline, tenantName, signOutSlot,
}: {
  alunoName: string;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  dateISO: string;
  dateLabel: string;
  day: AlunoSession[];
  week: WeekDay[];
  weekStrip: WeekDayStrip[];
  hasGeofence: boolean;
  progress: { presencas: number; threshold: number; pct: number };
  timeline: TimelineItem[];
  tenantName: string;
  signOutSlot: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as unknown as { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const changeDate = (v: string) => router.push(`/aluno?date=${v}`);

  const doCheckin = (sessionId: string) =>
    startTransition(async () => {
      const coords = hasGeofence ? await getPosition() : null;
      const r = await checkInToSession({ sessionId, lat: coords?.lat, lng: coords?.lng });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Presença registrada!");
      router.refresh();
    });

  const doUndo = (sessionId: string) =>
    startTransition(async () => {
      const r = await undoCheckIn({ sessionId });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const soon = () => toast.info("Em breve 🥋");
  const scrollTreinos = () =>
    document.getElementById("treinos")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const beltKey = belt ? belt.toLowerCase() : null;
  const beltColor = beltKey ? BELT_BG[beltKey] ?? "var(--f-cinza)" : "var(--f-cinza)";
  const initials = alunoName.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();

  return (
    <>
      <main className="gb-shell">
        {/* Topbar */}
        <div className="gb-top">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/pwa-icon?s=64" alt="" />
            <div className="n">GRACIE BARRA<small>{tenantName.toUpperCase()}</small></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="gb-icon-btn" onClick={soon} aria-label="Notificações"><Bell size={17} /></button>
            {signOutSlot}
          </div>
        </div>

        {installPrompt ? (
          <button className="gb-install" onClick={() => { installPrompt.prompt(); setInstallPrompt(null); }}>
            <MapPin size={15} /> Instalar o app no celular
          </button>
        ) : null}

        {/* Card de perfil */}
        <div className="gb-profile">
          <div className="row">
            <div className="gb-avatar">{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="name">{alunoName}</div>
              <div className="mat">{matricula ? `Matrícula ${matricula}` : "Aluno"}</div>
              <div className="gb-belt">
                <span className="bar" style={{ background: beltColor }} />
                <span className="lbl">
                  {belt ? `FAIXA ${belt.toUpperCase()}` : "SEM FAIXA"}
                  <small>{beltDegree ? `${beltDegree}º grau` : "—"}</small>
                </span>
              </div>
            </div>
          </div>
          <div className="gb-progress">
            <div className="head">
              <span>Rumo à próxima graduação</span>
              <span>{progress.presencas} / {progress.threshold} presenças</span>
            </div>
            <div className="track"><div className="fill" style={{ width: `${progress.pct}%` }} /></div>
          </div>
        </div>

        {/* Calendário (semana) */}
        <div className="gb-sec">
          <div className="gb-sec-h">
            <h2>Calendário</h2>
            <input
              type="date" value={dateISO} onChange={(e) => changeDate(e.target.value)}
              disabled={pending}
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", borderRadius: 9, padding: "4px 8px", fontSize: 12 }}
            />
          </div>
          <div className="gb-week">
            {weekStrip.map((d) => (
              <button
                key={d.iso}
                className={`gb-day${d.isSelected ? " on" : ""}`}
                onClick={() => changeDate(d.iso)}
                disabled={pending}
              >
                <div className="dow">{d.dow}</div>
                <div className="num">{d.num}</div>
                <div className={`dot${d.trained ? " treinou" : ""}`} />
              </button>
            ))}
          </div>
          <button className="gb-cta" onClick={scrollTreinos} disabled={pending}>
            <MapPin size={20} />
            <span className="t"><b>FAZER CHECK-IN</b><span>Registre sua presença hoje</span></span>
          </button>
        </div>

        {/* Treinos de hoje */}
        <div className="gb-sec" id="treinos">
          <div className="gb-sec-h"><h2>Treinos de hoje</h2><span style={{ fontSize: 11, color: "var(--muted-2)" }}>{dateLabel}</span></div>
          {day.length === 0 ? (
            <div className="gb-empty">Nenhuma aula neste dia.</div>
          ) : (
            day.map((s) => {
              const done = s.myCheckin !== null;
              const confirmed = s.myCheckin?.present ?? false;
              return (
                <div key={s.id} className={`gb-class${done ? " done" : ""}`}>
                  <div className="ico"><Dumbbell size={18} color="var(--red)" /></div>
                  <div className="mid">
                    <div className="time">{s.startTime}</div>
                    <div className="ttl">
                      <span className="prog">{s.label}</span>
                      {s.isKids ? <span className="gb-tag kids">Kids</span> : null}
                    </div>
                    {s.professorName ? <div className="prof">{s.professorName}</div> : null}
                  </div>
                  {confirmed ? (
                    <span className="status">✓ presente</span>
                  ) : done ? (
                    <button className="gb-btn ghost" disabled={pending} onClick={() => doUndo(s.id)}>
                      <Undo2 size={14} /> check-in feito
                    </button>
                  ) : (
                    <button className="gb-btn primary" disabled={pending} onClick={() => doCheckin(s.id)}>
                      <MapPin size={14} /> Check-in
                    </button>
                  )}
                </div>
              );
            })
          )}
          {hasGeofence ? (
            <p style={{ fontSize: 11, color: "var(--muted-2)", margin: "4px 2px 0" }}>
              O check-in confirma sua localização — permita o acesso ao GPS.
            </p>
          ) : null}
        </div>

        {/* Linha do tempo */}
        <div className="gb-sec">
          <div className="gb-sec-h"><h2>Linha do tempo</h2></div>
          {timeline.length === 0 ? (
            <div className="gb-empty">Nenhuma graduação registrada ainda.</div>
          ) : (
            timeline.map((t) => (
              <div key={t.id} className="gb-tl">
                <span className="swatch" style={{ background: BELT_BG[t.belt.toLowerCase()] ?? "var(--f-cinza)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="g-ttl">Faixa {t.belt}{t.beltDegree ? ` · ${t.beltDegree}º grau` : ""}</div>
                  <div className="g-sub">
                    {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(t.graduatedAtISO))}
                    {t.professorName ? ` · ${t.professorName}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                {t.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/aluno/graduation/${t.id}/photo`} alt="" />
                ) : null}
              </div>
            ))
          )}
        </div>

        {pending ? (
          <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            <Loader2 size={13} className="animate-spin" /> processando…
          </p>
        ) : null}
      </main>

      {/* Bottom nav */}
      <nav className="gb-nav">
        <div className="inner">
          <a className="on" href="/aluno"><span className="cico"><Home size={19} /></span>Início</a>
          <button type="button" onClick={soon} style={btnReset}><span className="cico"><CalendarDays size={19} /></span>Treinos</button>
          <button type="button" onClick={scrollTreinos} style={btnReset}><span className="cico"><MapPin size={19} /></span>Check-in</button>
          <button type="button" onClick={soon} style={btnReset}><span className="cico"><Wallet size={19} /></span>Financeiro</button>
          <button type="button" onClick={soon} style={btnReset}><span className="cico"><User size={19} /></span>Perfil</button>
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
