"use client";

import { KeyRound, Loader2, MapPin, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  clearAcademyLocation,
  createAlunoAccess,
  resetAlunoPassword,
  setAcademyLocation,
  toggleAluno,
  updateAluno,
} from "./actions";

type AlunoRow = {
  id: string;
  nome: string;
  phone: string | null;
  email: string | null;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  active: boolean;
  createdAtISO: string;
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
// Ordem de graduação (kids → adulto) pra ordenar por faixa E grau corretamente.
const BELT_RANK: Record<string, number> = {
  branca: 0, cinza: 1, amarela: 2, laranja: 3, verde: 4,
  azul: 5, roxa: 6, marrom: 7, preta: 8,
};
const rankOf = (belt: string | null) =>
  belt ? BELT_RANK[belt.toLowerCase()] ?? -1 : -1;

const emptyCreate = {
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
  const [form, setForm] = useState({ ...emptyCreate });
  const [loc, setLoc] = useState({
    latitude: location.latitude?.toString() ?? "",
    longitude: location.longitude?.toString() ?? "",
    radiusMeters: location.radiusMeters.toString(),
  });

  // Filtros / ordenação
  const [q, setQ] = useState("");
  const [faixaFilter, setFaixaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [sortBy, setSortBy] = useState<"graduacao" | "nome" | "matricula" | "recentes">("nome");

  // Edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: "", phone: "", email: "", matricula: "", belt: "", beltDegree: "0", active: true,
  });
  const [pwId, setPwId] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const setC = (k: keyof typeof emptyCreate, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const filtered = useMemo(() => {
    let rows = alunos.slice();
    if (statusFilter !== "todos") {
      rows = rows.filter((a) => (statusFilter === "ativos" ? a.active : !a.active));
    }
    if (faixaFilter) {
      rows = rows.filter((a) => (a.belt ?? "").toLowerCase() === faixaFilter.toLowerCase());
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.nome.toLowerCase().includes(s) ||
          (a.matricula ?? "").toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => {
      switch (sortBy) {
        case "graduacao":
          return (
            rankOf(b.belt) - rankOf(a.belt) ||
            (b.beltDegree ?? 0) - (a.beltDegree ?? 0) ||
            a.nome.localeCompare(b.nome)
          );
        case "matricula":
          return (a.matricula ?? "~").localeCompare(b.matricula ?? "~");
        case "recentes":
          return b.createdAtISO.localeCompare(a.createdAtISO);
        default:
          return a.nome.localeCompare(b.nome);
      }
    });
    return rows;
  }, [alunos, statusFilter, faixaFilter, q, sortBy]);

  const submitCreate = () =>
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
      if (!r.ok) return void toast.error(r.error);
      toast.success("Aluno cadastrado com acesso ao app");
      setForm({ ...emptyCreate });
      router.refresh();
    });

  const openEdit = (a: AlunoRow) => {
    setEditId(a.id);
    setPwId(null);
    setEdit({
      name: a.nome,
      phone: a.phone ?? "",
      email: a.email ?? "",
      matricula: a.matricula ?? "",
      belt: a.belt ?? "",
      beltDegree: String(a.beltDegree ?? 0),
      active: a.active,
    });
  };

  const saveEdit = (alunoId: string) =>
    startTransition(async () => {
      const r = await updateAluno({
        alunoId,
        name: edit.name,
        phone: edit.phone || undefined,
        email: edit.email,
        matricula: edit.matricula || undefined,
        belt: edit.belt || undefined,
        beltDegree: edit.belt ? Number(edit.beltDegree) : undefined,
        active: edit.active,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ficha atualizada");
      setEditId(null);
      router.refresh();
    });

  const savePassword = (alunoId: string) => {
    const password = pwRef.current?.value ?? "";
    startTransition(async () => {
      const r = await resetAlunoPassword({ alunoId, password });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Senha redefinida");
      setPwId(null);
      router.refresh();
    });
  };

  const toggle = (alunoId: string, active: boolean) =>
    startTransition(async () => {
      const r = await toggleAluno({ alunoId, active });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const saveLoc = () =>
    startTransition(async () => {
      const r = await setAcademyLocation({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radiusMeters: loc.radiusMeters,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Localização da academia salva");
      router.refresh();
    });

  const useMyLocation = () => {
    if (!navigator.geolocation) return void toast.error("Geolocalização indisponível");
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
      if (!r.ok) return void toast.error(r.error);
      setLoc((p) => ({ ...p, latitude: "", longitude: "" }));
      toast.success("Geofence desligado");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Alunos (acesso ao app)</h1>
        <p className="text-xs text-muted-foreground">
          Cadastre, edite e filtre os alunos. O login dá acesso ao app pra fazer
          check-in nas aulas.
        </p>
      </div>

      {/* Cadastro */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Cadastrar aluno</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Nome*</span>
            <Input value={form.name} onChange={(e) => setC("name", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Telefone</span>
            <Input value={form.phone} onChange={(e) => setC("phone", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Email (login)*</span>
            <Input type="email" value={form.email} onChange={(e) => setC("email", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Senha* (mín. 6)</span>
            <Input type="text" value={form.password} onChange={(e) => setC("password", e.target.value)} disabled={pending} />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-muted-foreground">Matrícula</span>
            <Input value={form.matricula} onChange={(e) => setC("matricula", e.target.value)} disabled={pending} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="mb-0.5 block text-muted-foreground">Faixa</span>
              <select value={form.belt} onChange={(e) => setC("belt", e.target.value)} disabled={pending} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">—</option>
                {BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-0.5 block text-muted-foreground">Grau</span>
              <select value={form.beltDegree} onChange={(e) => setC("beltDegree", e.target.value)} disabled={pending || !form.belt} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {[0, 1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}º</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <Button size="sm" disabled={pending} onClick={submitCreate}>Cadastrar aluno</Button>
        </div>
      </section>

      {/* Localização da academia (geofence) */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Localização da academia (check-in)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O aluno só bate presença dentro do raio. Preencha ou clique em “usar
          minha localização” estando na academia.
          {location.latitude == null ? (
            <span className="ml-1 font-medium text-amber-600">Geofence desligado — sem coordenada.</span>
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
          <Button size="sm" disabled={pending} onClick={saveLoc}>Salvar localização</Button>
          {location.latitude != null ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={disableGeofence}>Desligar geofence</Button>
          ) : null}
        </div>
      </section>

      {/* Lista + filtros */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Alunos cadastrados
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({filtered.length})
            </span>
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Input placeholder="Buscar nome/matrícula…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 sm:col-span-2" />
          <select value={faixaFilter} onChange={(e) => setFaixaFilter(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todas as faixas</option>
            {BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Ordenar:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="nome">Nome</option>
            <option value="graduacao">Graduação (maior → menor)</option>
            <option value="matricula">Matrícula</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-xs text-muted-foreground">
            Nenhum aluno com esses filtros.
          </p>
        ) : (
          filtered.map((a) => (
            <div key={a.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {a.nome}
                    {a.matricula ? <span className="ml-1 text-[10px] text-muted-foreground">#{a.matricula}</span> : null}
                    {!a.active ? <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">inativo</span> : null}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {a.email ?? "sem login"}
                    {a.belt ? ` · ${a.belt}${a.beltDegree ? ` ${a.beltDegree}º` : ""}` : ""}
                  </div>
                </div>
                <Button size="sm" variant={editId === a.id ? "secondary" : "outline"} disabled={pending} onClick={() => (editId === a.id ? setEditId(null) : openEdit(a))}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              </div>

              {editId === a.id ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Nome</span>
                      <Input value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} disabled={pending} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Telefone</span>
                      <Input value={edit.phone} onChange={(e) => setEdit((p) => ({ ...p, phone: e.target.value }))} disabled={pending} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Email (login)</span>
                      <Input type="email" value={edit.email} onChange={(e) => setEdit((p) => ({ ...p, email: e.target.value }))} disabled={pending} />
                    </label>
                    <label className="text-xs">
                      <span className="mb-0.5 block text-muted-foreground">Matrícula</span>
                      <Input value={edit.matricula} onChange={(e) => setEdit((p) => ({ ...p, matricula: e.target.value }))} disabled={pending} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        <span className="mb-0.5 block text-muted-foreground">Faixa</span>
                        <select value={edit.belt} onChange={(e) => setEdit((p) => ({ ...p, belt: e.target.value }))} disabled={pending} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                          <option value="">—</option>
                          {BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="mb-0.5 block text-muted-foreground">Grau</span>
                        <select value={edit.beltDegree} onChange={(e) => setEdit((p) => ({ ...p, beltDegree: e.target.value }))} disabled={pending || !edit.belt} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                          {[0, 1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g}º</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={edit.active} onChange={(e) => setEdit((p) => ({ ...p, active: e.target.checked }))} disabled={pending} />
                      <span>Ativo</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={pending} onClick={() => saveEdit(a.id)}>Salvar ficha</Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => setPwId(pwId === a.id ? null : a.id)}>
                      <KeyRound className="mr-1 h-4 w-4" /> Redefinir senha
                    </Button>
                    <Button size="sm" variant={a.active ? "ghost" : "secondary"} disabled={pending} onClick={() => toggle(a.id, !a.active)}>
                      {a.active ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                  {pwId === a.id ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Input ref={pwRef} type="text" placeholder="Nova senha (mín. 6)" className="h-9" disabled={pending} />
                      <Button size="sm" disabled={pending} onClick={() => savePassword(a.id)}>Salvar senha</Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
