"use client";

import { Camera, ChevronLeft, Image as ImageIcon, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { beltStyle } from "@/lib/belts";

import { changeMyPassword, updateMyContact, uploadMyPhoto } from "../actions";
import { Lightbox } from "../lightbox";

export function PerfilView({
  alunoId, hasPhoto, name, matricula, email, phone: phone0, belt, beltDegree,
  tenantName, signOutSlot,
}: {
  alunoId: string;
  hasPhoto: boolean;
  name: string;
  matricula: string | null;
  email: string;
  phone: string;
  belt: string | null;
  beltDegree: number | null;
  tenantName: string;
  signOutSlot: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(phone0);
  const [pw, setPw] = useState("");
  const [photoMenu, setPhotoMenu] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  const beltColor = beltStyle(belt).background;

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
      location.reload();
    });
  };

  const saveContact = () =>
    startTransition(async () => {
      const r = await updateMyContact({ phone });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Contato atualizado");
    });

  const savePassword = () =>
    startTransition(async () => {
      const r = await changeMyPassword({ password: pw });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Senha alterada");
      setPw("");
    });

  return (
    <>
      <main className="gb-shell">
        <div className="gb-cal-head">
          <Link href="/aluno" className="gb-icon-btn" aria-label="Voltar"><ChevronLeft size={18} /></Link>
          <span className="gb-cal-title">Perfil</span>
          <span style={{ width: 38 }} />
        </div>

        {/* Cabeçalho do perfil */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "8px 0 18px" }}>
          <button type="button" className="gb-avatar-btn" onClick={() => setPhotoMenu(true)} disabled={pending} aria-label="Trocar foto">
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="gb-avatar" style={{ width: 92, height: 92 }} src={`/api/aluno/${alunoId}/avatar`} alt="" />
            ) : (
              <span className="gb-avatar" style={{ width: 92, height: 92, fontSize: 30 }}>{initials}</span>
            )}
            <span className="gb-avatar-cam"><Camera size={14} /></span>
          </button>
          <input ref={camRef} type="file" accept="image/*" capture="user" onChange={onPhotoPick} style={{ display: "none" }} />
          <input ref={galleryRef} type="file" accept="image/*" onChange={onPhotoPick} style={{ display: "none" }} />
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }} className="dsp">{name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {matricula ? `Matrícula ${matricula} · ` : ""}{tenantName}
          </div>
          {belt ? (
            <span style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", padding: "6px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              <span style={{ width: 32, height: 10, borderRadius: 3, background: beltColor }} />
              FAIXA {belt.toUpperCase()}{beltDegree ? ` · ${beltDegree}º` : ""}
            </span>
          ) : null}
        </div>

        {/* Contato */}
        <div className="gb-sec">
          <div className="gb-sec-h"><h2>Contato</h2></div>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            E-mail (login)
            <input value={email} disabled className="gb-field" style={{ opacity: .6 }} />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Telefone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} className="gb-field" />
          </label>
          <button className="gb-btn primary" style={{ marginTop: 8 }} disabled={pending} onClick={saveContact}>
            Salvar contato
          </button>
        </div>

        {/* Senha */}
        <div className="gb-sec">
          <div className="gb-sec-h"><h2>Senha</h2></div>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>
            Nova senha (mín. 6)
            <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} disabled={pending} className="gb-field" placeholder="••••••" />
          </label>
          <button className="gb-btn ghost" style={{ marginTop: 8 }} disabled={pending || pw.length < 6} onClick={savePassword}>
            <KeyRound size={14} /> Trocar senha
          </button>
        </div>

        <div className="gb-sec">{signOutSlot}</div>

        {pending ? (
          <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            <Loader2 size={13} className="animate-spin" /> processando…
          </p>
        ) : null}
      </main>

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
