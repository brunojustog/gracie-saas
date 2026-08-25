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

import { beltStyle } from "@/lib/belts";
import type { AlunoSession, WeekDay } from "@/server/class-sessions";

import { uploadMyPhoto } from "./actions";
import { Lightbox } from "./lightbox";

type TimelineItem = {
  id: string;
  kind: "GRADUACAO" | "GRAU" | "CAMPEONATO" | "INICIO" | "OUTRO";
  title: string;
  subtitle: string | null;
  dateISO: string;
  belt: string | null;
  photos: string[];
};
const KIND_COLOR: Record<TimelineItem["kind"], string> = {
  GRADUACAO: "var(--red)", GRAU: "#eab308", CAMPEONATO: "#e8791e",
  INICIO: "var(--blue-400)", OUTRO: "var(--muted-2)",
};
type WeekDayStrip = {
  iso: string; dow: string; num: string; trained: boolean; isToday: boolean; isSelected: boolean;
};

export function AlunoView({
  alunoId, hasPhoto, alunoName, matricula, belt, beltDegree, dateISO,
  weekStrip, progress, timeline, tenantName, signOutSlot, showProgress,
}: {
  alunoId: string;
  hasPhoto: boolean;
  showProgress: boolean;
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
  const [lightbox, setLightbox] = useState<string | null>(null);

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

  const beltBg = beltStyle(belt).background;
  const initials = alunoName.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();

  return (
    <>
      <main className="gb-shell">
        {/* Topbar */}
        <div className="gb-top">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" />
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
                <span className="bar" style={{ background: beltBg }} />
                <span className="lbl">
                  {belt ? `FAIXA ${belt.toUpperCase()}` : "SEM FAIXA"}
                  <small>{beltDegree ? `${beltDegree}º grau` : "—"}</small>
                </span>
              </div>
            </div>
          </div>
          {showProgress ? (
            <div className="gb-progress">
              <div className="head">
                <span>Rumo à próxima graduação</span>
                <span>{progress.presencas} / {progress.threshold} presenças</span>
              </div>
              <div className="track"><div className="fill" style={{ width: `${progress.pct}%` }} /></div>
            </div>
          ) : null}
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
            timeline.map((t) => {
              const swatch = t.kind === "GRADUACAO" && t.belt
                ? beltStyle(t.belt).background
                : KIND_COLOR[t.kind];
              return (
                <div key={t.id} className="gb-tl">
                  <span className="swatch" style={{ background: swatch }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="g-ttl">{t.title}</div>
                    <div className="g-sub">
                      {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${t.dateISO}T12:00:00`))}
                      {t.subtitle ? ` · ${t.subtitle}` : ""}
                    </div>
                  </div>
                  {t.photos.length > 0 ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      {t.photos.slice(0, 3).map((src, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightbox(src)}
                          style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
                          aria-label="Ver foto"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
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
          <Link href="/aluno/grade" style={btnReset as React.CSSProperties}><span className="cico"><CalendarDays size={19} /></span>Grade</Link>
          <Link href={`/aluno/checkin?date=${dateISO}`} style={btnReset as React.CSSProperties}><span className="cico"><MapPin size={19} /></span>Check-in</Link>
          <Link href="/aluno/financeiro" style={btnReset as React.CSSProperties}><span className="cico"><Wallet size={19} /></span>Financeiro</Link>
          <Link href="/aluno/perfil" style={btnReset as React.CSSProperties}><span className="cico"><User size={19} /></span>Perfil</Link>
        </div>
      </nav>

      {/* Sheet de foto: tirar (câmera) ou carregar (galeria) */}
      {photoMenu ? (
        <div className="gb-sheet-backdrop" onClick={() => setPhotoMenu(false)}>
          <div className="gb-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="gb-sheet-title">Foto de perfil</div>
            {hasPhoto ? (
              <button className="gb-sheet-item" onClick={() => { setPhotoMenu(false); setLightbox(`/api/aluno/${alunoId}/avatar`); }}>
                <ImageIcon size={18} /> Ver foto
              </button>
            ) : null}
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

      {lightbox ? <Lightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </>
  );
}

const btnReset: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  padding: "9px 0", background: "none", border: 0, color: "var(--muted-2)",
  fontSize: 10, fontWeight: 600, cursor: "pointer",
};
