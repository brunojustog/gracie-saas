"use client";

import { Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  clearAcademyLocation,
  createAlunoAccess,
  setAcademyLocation,
  toggleAluno,
} from "./actions";

type AlunoRow = {
  id: string;
  nome: string;
  email: string | null;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  active: boolean;
};
type Location = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};

const BELTS = [
  "Branca", "Cinza", "Amarela", "Laranja", "Verde",
  "Azul", "Roxa", "Marrom", "Preta",
];

const empty = {
  name: "", email: "", password: "", phone: "", matricula: "", belt: "", beltDegree: "0",
};

export function AlunosEditor({
  alunos,
  location,
}: {
  alunos: AlunoRow[];
  location: Location;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ ...empty });
  const [loc, setLoc] = useState({
    latitude: location.latitude?.toString() ?? "",
    longitude: location.longitude?.toString() ?? "",
    radiusMeters: location.radiusMeters.toString(),
  });

  const set = (k: keyof typeof empty, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = () =>
    startTransition(async () => {
      const r = await createAlunoAccess({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        matricula: form.matricula || undefined,
        belt: form.belt || undefined,
        beltDegree: form.belt ? Number(form.beltDegree) : undefined,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Aluno cadastrado com acesso ao app");
      setForm({ ...empty });
      router.refresh();
    });

  const toggle = (alunoId: string, active: boolean) =>
    startTransition(async () => {
      const r = await toggleAluno({ alunoId, active });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });

  const saveLoc = () =>
    startTransition(async () => {
      const r = await setAcademyLocation({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radiusMeters: loc.radiusMeters,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Localização da academia salva");
      router.refresh();
    });

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização indisponível neste navegador");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLoc((p) => ({
          ...p,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        })),
      () => toast.error("Não consegui pegar sua localização"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const disableGeofence = () =>
    startTransition(async () => {
      const r = await clearAcademyLocation();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setLoc((p) => ({ ...p, latitude: "", longitude: "" }));
      toast.success("Geofence desligado");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Alunos (acesso ao app)</h1>
        <p className="text-xs text-muted-foreground">
          Cadastre o aluno com login e senha pra ele acessar o app e fazer
          check-in nas aulas.
        </p>
      </div>

      {/* Cadastro */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Cadastrar aluno</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Nome*</span>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Telefone</span>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Email (login)*</span>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Senha* (mín. 6)</span>
            <Input type="text" value={form.password} onChange={(e) => set("password", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Matrícula</span>
            <Input value={form.matricula} onChange={(e) => set("matricula", e.target.value)} disabled={pending} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="mb-0.5 block text-muted-foreground">Faixa</span>
              <select
                value={form.belt}
                onChange={(e) => set("belt", e.target.value)}
                disabled={pending}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">—</option>
                {BELTS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-0.5 block text-muted-foreground">Grau</span>
              <select
                value={form.beltDegree}
                onChange={(e) => set("beltDegree", e.target.value)}
                disabled={pending || !form.belt}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((g) => (
                  <option key={g} value={g}>{g}º</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <Button size="sm" disabled={pending} onClick={submit}>
            Cadastrar aluno
          </Button>
        </div>
      </section>

      {/* Localização da academia (geofence) */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Localização da academia (check-in)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O aluno só bate presença dentro do raio. Preencha ou clique em “usar
          minha localização” estando na academia.
          {location.latitude == null ? (
            <span className="ml-1 font-medium text-amber-600">
              Geofence desligado — nenhuma coordenada definida.
            </span>
          ) : null}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Latitude</span>
            <Input value={loc.latitude} onChange={(e) => setLoc((p) => ({ ...p, latitude: e.target.value }))} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Longitude</span>
            <Input value={loc.longitude} onChange={(e) => setLoc((p) => ({ ...p, longitude: e.target.value }))} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Raio (metros)</span>
            <Input value={loc.radiusMeters} onChange={(e) => setLoc((p) => ({ ...p, radiusMeters: e.target.value }))} disabled={pending} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={useMyLocation}>
            <MapPin className="mr-1 h-4 w-4" /> Usar minha localização
          </Button>
          <Button size="sm" disabled={pending} onClick={saveLoc}>
            Salvar localização
          </Button>
          {location.latitude != null ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={disableGeofence}>
              Desligar geofence
            </Button>
          ) : null}
        </div>
      </section>

      {/* Lista */}
      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold">Alunos cadastrados</h2>
        {alunos.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-xs text-muted-foreground">
            Nenhum aluno com acesso ainda.
          </p>
        ) : (
          alunos.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {a.nome}
                  {a.matricula ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">#{a.matricula}</span>
                  ) : null}
                  {!a.active ? (
                    <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">inativo</span>
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {a.email ?? "sem login"}
                  {a.belt ? ` · ${a.belt}${a.beltDegree ? ` ${a.beltDegree}º` : ""}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant={a.active ? "outline" : "secondary"}
                disabled={pending}
                onClick={() => toggle(a.id, !a.active)}
              >
                {a.active ? "Inativar" : "Reativar"}
              </Button>
            </div>
          ))
        )}
      </section>

      {pending ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </div>
  );
}
