"use client";

import {
  Bell,
  CalendarDays,
  Camera,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  User,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import type { AlunoSession, WeekDay } from "@/server/class-sessions";

import { uploadMyPhoto } from "./actions";

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

export function AlunoView({
  alunoId, hasPhoto, alunoName, matricula, belt, beltDegree, dateISO,
  weekStrip, progress, timeline, tenantName, signOutSlot,
}: {
  alunoId: string;
  hasPhoto: boolean;
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
  const camRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photoMenu, setPhotoMenu] = useState(false);

  const onPhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("photo", file);
    startTransition(async () => {
      const r = await uploadMyPhoto(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Foto atualizada!");
      router.refresh();
    });
  };

  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as unknown as { prompt: () => Promise<void> }); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const changeDate = (v: string) => router.push(`/aluno?date=${v}`);
  const soon = () => toast.info("Em breve 🥋");

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
            <button
              type="button"
              className="gb-avatar-btn"
              onClick={() => setPhotoMenu(true)}
              disabled={pending}
              aria-label="Trocar foto"
            >
              {hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gb-avatar" src={`/api/aluno/${alunoId}/avatar`} alt="" />
              ) : (
                <span className="gb-avatar">{initials}</span>
              )}
              <span className="gb-avatar-cam"><Camera size={13} /></span>
            </button>
            <input ref={camRef} type="file" accept="image/*" capture="user" onChange={onPhotoPick} style={{ display: "none" }} />
            <input ref={galleryRef} type="file" accept="image/*" onChange={onPhotoPick} style={{ display: "none" }} />
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
            <Link href={`/aluno/calendario?date=${dateISO}`} className="link">
              <CalendarDays size={14} /> ver mês
            </Link>
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
          <Link href={`/aluno/checkin?date=${dateISO}`} className="gb-cta" style={{ textDecoration: "none" }}>
            <MapPin size={20} />
            <span className="t"><b>FAZER CHECK-IN</b><span>Registre sua presença hoje</span></span>
          </Link>
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
          <Link href={`/aluno/checkin?date=${dateISO}`} style={btnReset as React.CSSProperties}><span className="cico"><CalendarDays size={19} /></span>Treinos</Link>
          <Link href={`/aluno/checkin?date=${dateISO}`} style={btnReset as React.CSSProperties}><span className="cico"><MapPin size={19} /></span>Check-in</Link>
          <button type="button" onClick={soon} style={btnReset}><span className="cico"><Wallet size={19} /></span>Financeiro</button>
          <button type="button" onClick={soon} style={btnReset}><span className="cico"><User size={19} /></span>Perfil</button>
        </div>
      </nav>

      {/* Sheet de foto: tirar (câmera) ou carregar (galeria) */}
      {photoMenu ? (
        <div className="gb-sheet-backdrop" onClick={() => setPhotoMenu(false)}>
          <div className="gb-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gb-sheet-title">Foto de perfil</div>
            <button className="gb-sheet-item" onClick={() => { setPhotoMenu(false); camRef.current?.click(); }}>
              <Camera size={18} /> Tirar foto
            </button>
            <button className="gb-sheet-item" onClick={() => { setPhotoMenu(false); galleryRef.current?.click(); }}>
              <ImageIcon size={18} /> Carregar foto
            </button>
            <button className="gb-sheet-cancel" onClick={() => setPhotoMenu(false)}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const btnReset: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  padding: "9px 0", background: "none", border: 0, color: "var(--muted-2)",
  fontSize: 10, fontWeight: 600, cursor: "pointer",
};
