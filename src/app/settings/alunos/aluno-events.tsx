"use client";

import { Award, CalendarPlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_BELTS } from "@/lib/belts";

import {
  addTimelineEvent,
  deleteGraduation,
  deleteTimelineEvent,
  updateGraduation,
  updateTimelineEvent,
} from "./event-actions";

export type AdminEvent = {
  id: string;
  kind: "GRADUACAO" | "GRAU" | "CAMPEONATO" | "INICIO" | "OUTRO";
  title: string;
  dateISO: string;
  note: string | null;
  photoIds: string[];
};

export type AdminGraduation = {
  id: string;
  belt: string;
  beltDegree: number;
  dateISO: string;
  note: string | null;
  hasPhoto: boolean;
};

const KINDS: { value: AdminEvent["kind"]; label: string }[] = [
  { value: "GRADUACAO", label: "Graduação" },
  { value: "GRAU", label: "Grau" },
  { value: "CAMPEONATO", label: "Campeonato" },
  { value: "INICIO", label: "Início no Jiu-Jitsu" },
  { value: "OUTRO", label: "Outro" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

const emptyForm = { kind: "CAMPEONATO", title: "", eventDate: "", note: "" };
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const beltLabel = (belt: string, grau: number) => `${belt}${grau ? ` ${grau}º` : ""}`;

export function AlunoEvents({
  alunoId,
  events,
  graduations,
}: {
  alunoId: string;
  events: AdminEvent[];
  graduations: AdminGraduation[];
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ ...emptyForm });
  const [preview, setPreview] = useState<string | null>(null);
  const [editEv, setEditEv] = useState<string | null>(null);
  const [editGrad, setEditGrad] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!form.title.trim()) return void toast.error("Informe o título");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) return void toast.error("Informe a data");
    const fd = new FormData();
    fd.set("alunoId", alunoId);
    fd.set("kind", form.kind);
    fd.set("title", form.title);
    fd.set("eventDate", form.eventDate);
    if (form.note) fd.set("note", form.note);
    for (const f of fileRef.current?.files ?? []) fd.append("photos", f);
    startTransition(async () => {
      const r = await addTimelineEvent(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Evento adicionado");
      setForm({ ...emptyForm });
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const removeEvent = (eventId: string) =>
    startTransition(async () => {
      const r = await deleteTimelineEvent({ eventId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Evento removido");
    });

  const removeGrad = (graduationId: string) =>
    startTransition(async () => {
      if (!window.confirm("Excluir esta graduação? (a faixa atual do aluno não muda)")) return;
      const r = await deleteGraduation({ graduationId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Graduação removida");
    });

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {/* ── Graduações ─────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Award className="h-3.5 w-3.5" /> Graduações ({graduations.length})
        </div>
        {graduations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Nenhuma graduação registrada.</p>
        ) : (
          <ul className="space-y-1.5">
            {graduations.map((g) =>
              editGrad === g.id ? (
                <GradEditRow key={g.id} grad={g} pending={pending} onDone={() => setEditGrad(null)} startTransition={startTransition} />
              ) : (
                <li key={g.id} className="rounded-lg border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                      {beltLabel(g.belt, g.beltDegree)}
                    </span>
                    <span className="flex-1 text-[11px] text-muted-foreground">{brDate(g.dateISO)}</span>
                    <button type="button" disabled={pending} onClick={() => setEditGrad(g.id)} className="text-muted-foreground hover:text-foreground" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={pending} onClick={() => removeGrad(g.id)} className="text-muted-foreground hover:text-destructive" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {g.note ? <div className="mt-0.5 text-[11px] text-muted-foreground">{g.note}</div> : null}
                  {g.hasPhoto ? (
                    <button type="button" onClick={() => setPreview(`/api/aluno/graduation/${g.id}/photo`)} className="mt-1.5 block rounded focus:outline-none focus-visible:ring-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/aluno/graduation/${g.id}/photo`} alt="" className="h-12 w-12 cursor-pointer rounded object-cover" />
                    </button>
                  ) : null}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {/* ── Linha do tempo (eventos) ───────────────── */}
      <div className="text-xs font-semibold">Linha do tempo (eventos)</div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-0.5 block text-muted-foreground">Tipo</span>
          <select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))} disabled={pending} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-0.5 block text-muted-foreground">Data</span>
          <Input type="date" value={form.eventDate} onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))} disabled={pending} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="mb-0.5 block text-muted-foreground">Título</span>
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} disabled={pending} placeholder="ex: 1º lugar Campeonato Paulista" />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="mb-0.5 block text-muted-foreground">Observação (opcional)</span>
          <Input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} disabled={pending} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="mb-0.5 block text-muted-foreground">Fotos (opcional, várias)</span>
          <Input ref={fileRef} type="file" accept="image/*" multiple disabled={pending} className="cursor-pointer" />
        </label>
      </div>
      <Button size="sm" disabled={pending} onClick={submit}>
        <CalendarPlus className="mr-1 h-4 w-4" /> Adicionar evento
      </Button>

      {events.length > 0 ? (
        <ul className="space-y-1.5 pt-1">
          {events.map((ev) =>
            editEv === ev.id ? (
              <EventEditRow key={ev.id} ev={ev} pending={pending} onDone={() => setEditEv(null)} startTransition={startTransition} />
            ) : (
              <li key={ev.id} className="rounded-lg border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">{KIND_LABEL[ev.kind]}</span>
                  <span className="flex-1 font-medium">{ev.title}</span>
                  <span className="text-[11px] text-muted-foreground">{brDate(ev.dateISO)}</span>
                  <button type="button" disabled={pending} onClick={() => setEditEv(ev.id)} className="text-muted-foreground hover:text-foreground" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={pending} onClick={() => removeEvent(ev.id)} className="text-muted-foreground hover:text-destructive" title="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {ev.note ? <div className="mt-0.5 text-[11px] text-muted-foreground">{ev.note}</div> : null}
                {ev.photoIds.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ev.photoIds.map((pid) => (
                      <button key={pid} type="button" onClick={() => setPreview(`/api/aluno/event-photo/${pid}`)} className="rounded ring-offset-2 focus:outline-none focus-visible:ring-2" aria-label="Ver foto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/aluno/event-photo/${pid}`} alt="" className="h-12 w-12 cursor-pointer rounded object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nenhum evento ainda.</p>
      )}

      {pending ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-5" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={() => setPreview(null)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
    </div>
  );
}

function EventEditRow({
  ev,
  pending,
  onDone,
  startTransition,
}: {
  ev: AdminEvent;
  pending: boolean;
  onDone: () => void;
  startTransition: (cb: () => void) => void;
}) {
  const [kind, setKind] = useState(ev.kind);
  const [title, setTitle] = useState(ev.title);
  const [eventDate, setEventDate] = useState(ev.dateISO);
  const [note, setNote] = useState(ev.note ?? "");

  const save = () =>
    startTransition(async () => {
      const r = await updateTimelineEvent({ eventId: ev.id, kind, title, eventDate, note: note || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Evento atualizado");
      onDone();
    });

  return (
    <li className="space-y-2 rounded-lg border bg-muted/30 p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as AdminEvent["kind"])} disabled={pending} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={pending} />
        <Input className="sm:col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} placeholder="Título" />
        <Input className="sm:col-span-2" value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="Observação" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save}>Salvar</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onDone}>Cancelar</Button>
      </div>
    </li>
  );
}

function GradEditRow({
  grad,
  pending,
  onDone,
  startTransition,
}: {
  grad: AdminGraduation;
  pending: boolean;
  onDone: () => void;
  startTransition: (cb: () => void) => void;
}) {
  const [belt, setBelt] = useState(grad.belt);
  const [grau, setGrau] = useState(String(grad.beltDegree));
  const [date, setDate] = useState(grad.dateISO);
  const [note, setNote] = useState(grad.note ?? "");

  const save = () =>
    startTransition(async () => {
      const r = await updateGraduation({ graduationId: grad.id, belt, beltDegree: Number(grau) || 0, graduatedAt: date, note: note || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Graduação atualizada");
      onDone();
    });

  return (
    <li className="space-y-2 rounded-lg border bg-muted/30 p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={belt} onChange={(e) => setBelt(e.target.value)} disabled={pending} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
          {ALL_BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <Input value={grau} onChange={(e) => setGrau(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="grau" disabled={pending} />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
        <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="Observação" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save}>Salvar</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onDone}>Cancelar</Button>
      </div>
    </li>
  );
}
