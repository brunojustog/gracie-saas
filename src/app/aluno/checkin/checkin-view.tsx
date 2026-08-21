"use client";

import { Check, ChevronLeft, Dumbbell, Loader2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AlunoSession } from "@/server/class-sessions";

import { checkInToSession, undoCheckIn } from "../actions";

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

export function CheckinView({
  dateLabel,
  day,
  hasGeofence,
  firstName,
}: {
  dateLabel: string;
  day: AlunoSession[];
  hasGeofence: boolean;
  firstName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<AlunoSession | null>(null);

  const doCheckin = (s: AlunoSession) =>
    startTransition(async () => {
      const coords = hasGeofence ? await getPosition() : null;
      const r = await checkInToSession({ sessionId: s.id, lat: coords?.lat, lng: coords?.lng });
      if (!r.ok) return void toast.error(r.error);
      setDone(s);
      router.refresh();
    });

  const doUndo = (sessionId: string) =>
    startTransition(async () => {
      const r = await undoCheckIn({ sessionId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Check-in cancelado");
      router.refresh();
    });

  // Tela de sucesso
  if (done) {
    return (
      <main className="gb-shell" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 40 }}>
        <div className="gb-success-ring"><Check size={44} color="#fff" /></div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "22px 0 18px" }}>Check-in realizado!</h1>
        <div className="gb-class" style={{ width: "100%", maxWidth: 340 }}>
          <div className="ico"><Dumbbell size={18} color="var(--red)" /></div>
          <div className="mid">
            <div className="time">{done.startTime}{done.professorName ? ` · ${done.professorName}` : ""}</div>
            <div className="ttl"><span className="prog">{done.label}</span></div>
          </div>
          <Check size={20} color="var(--ok)" />
        </div>
        <p style={{ color: "var(--muted)", marginTop: 16 }}>Boa aula, {firstName}! 👊</p>
        <Link href="/aluno" className="gb-cta" style={{ maxWidth: 340, marginTop: 20, textDecoration: "none" }}>
          <span className="t" style={{ textAlign: "center", width: "100%" }}><b>VOLTAR PARA INÍCIO</b></span>
        </Link>
        {day.some((s) => s.id !== done.id && s.myCheckin === null) ? (
          <button className="gb-btn ghost" style={{ marginTop: 12 }} onClick={() => setDone(null)}>
            Bater em outra aula
          </button>
        ) : null}
      </main>
    );
  }

  return (
    <main className="gb-shell">
      <div className="gb-cal-head">
        <Link href="/aluno" className="gb-icon-btn" aria-label="Voltar"><ChevronLeft size={18} /></Link>
        <span className="gb-cal-title">Check-in</span>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div className="gb-checkin-hero"><MapPin size={34} color="#fff" /></div>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginTop: 14 }}>Escolha sua aula</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, textTransform: "capitalize" }}>{dateLabel}</p>
      </div>

      {day.length === 0 ? (
        <div className="gb-empty">Nenhuma aula pra você neste dia.</div>
      ) : (
        day.map((s) => {
          const confirmed = s.myCheckin?.present ?? false;
          const doneCheck = s.myCheckin !== null;
          return (
            <div key={s.id} className={`gb-class${doneCheck ? " done" : ""}`}>
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
              ) : doneCheck ? (
                <button className="gb-btn ghost" disabled={pending} onClick={() => doUndo(s.id)}>
                  <X size={14} /> cancelar
                </button>
              ) : (
                <button className="gb-btn primary" disabled={pending} onClick={() => doCheckin(s)}>
                  <MapPin size={14} /> Check-in
                </button>
              )}
            </div>
          );
        })
      )}

      {hasGeofence ? (
        <p style={{ fontSize: 11, color: "var(--muted-2)", margin: "10px 2px 0", textAlign: "center" }}>
          O check-in confirma sua localização — permita o acesso ao GPS.
        </p>
      ) : null}

      {pending ? (
        <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          <Loader2 size={13} className="animate-spin" /> registrando…
        </p>
      ) : null}
    </main>
  );
}
