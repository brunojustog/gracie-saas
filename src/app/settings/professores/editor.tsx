"use client";

import { Camera, Plus, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  createProfessor,
  removeProfessorPhoto,
  updateProfessor,
  uploadProfessorPhoto,
} from "./actions";

type Professor = {
  id: string;
  name: string;
  active: boolean;
  email: string | null;
  userId: string | null;
  hourlyRate: number;
  activeSlots: number;
  isOwner: boolean;
  hasPhoto: boolean;
};
type Member = { userId: string; label: string; email: string };

export function ProfessorsEditor({
  professors,
  members,
}: {
  professors: Professor[];
  members: Member[];
}) {
  const [editing, setEditing] = useState<Professor | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Professores</h2>
          <p className="text-xs text-muted-foreground">
            Quem dá as aulas particulares. Usado pra atribuir cada aula a um
            professor e fechar o mês por professor. Inativos somem dos forms
            novos mas preservam o histórico.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Novo professor
        </Button>
      </div>

      {professors.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum professor cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {professors.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
                !p.active ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span>
                {!p.active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    inativo
                  </span>
                )}
                <div className="text-xs text-muted-foreground">
                  {p.userId ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      login vinculado
                    </span>
                  ) : (
                    <span>sem login {p.email ? `· ${p.email}` : ""}</span>
                  )}
                  {p.active && p.activeSlots > 0 ? (
                    <span> · {p.activeSlots} aula{p.activeSlots === 1 ? "" : "s"} na grade</span>
                  ) : null}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                Editar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ProfessorFormDialog
        professor={editing}
        members={members}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </div>
  );
}

const NO_LINK = "__none__";

function ProfessorFormDialog({
  professor,
  members,
  creating,
  onClose,
}: {
  professor: Professor | null;
  members: Member[];
  creating: boolean;
  onClose: () => void;
}) {
  const open = creating || professor !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <ProfessorFormBody
            key={professor?.id ?? "new"}
            professor={professor}
            members={members}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfessorFormBody({
  professor,
  members,
  onClose,
}: {
  professor: Professor | null;
  members: Member[];
  onClose: () => void;
}) {
  const [name, setName] = useState(professor?.name ?? "");
  const [active, setActive] = useState(professor?.active ?? true);
  const [email, setEmail] = useState(professor?.email ?? "");
  const [userId, setUserId] = useState(professor?.userId ?? NO_LINK);
  const [hourlyRate, setHourlyRate] = useState(String(professor?.hourlyRate ?? 70));
  const [isOwner, setIsOwner] = useState(professor?.isOwner ?? false);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    startTransition(async () => {
      const result = professor
        ? await updateProfessor({
            id: professor.id,
            name: name.trim(),
            active,
            email: email.trim() || null,
            userId: userId === NO_LINK ? null : userId,
            hourlyRate: Number(hourlyRate.replace(",", ".")) || 0,
            isOwner,
          })
        : await createProfessor({ name: name.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if ("deactivatedSlots" in result && result.deactivatedSlots) {
        toast.success(
          `Professor inativado · ${result.deactivatedSlots} aula(s) da grade desativada(s)`,
        );
      } else {
        toast.success(professor ? "Professor atualizado" : "Professor criado");
      }
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{professor ? "Editar professor" : "Novo professor"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="prof-name">Nome</Label>
          <Input
            id="prof-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Caue Mandú"
            autoFocus
          />
        </div>
        {professor ? (
          <>
            <div className="space-y-1">
              <Label>Foto (aparece no card da aula do aluno)</Label>
              <ProfessorPhoto professorId={professor.id} hasPhoto={professor.hasPhoto} name={professor.name} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prof-email">E-mail (pro convite)</Label>
              <Input
                id="prof-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex: cauemguimaraes@hotmail.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prof-rate">Hora-aula (R$)</Label>
              <Input
                id="prof-rate"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                inputMode="decimal"
                placeholder="70"
              />
              <p className="text-[11px] text-muted-foreground">
                Base da bonificação por conversão de experimental (1,5×). Preta
                R$70, marrom R$60.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="prof-link">Login vinculado</Label>
              <select
                id="prof-link"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value={NO_LINK}>— sem login —</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.label} · {m.email}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Convide o professor em Config → Usuários (papel Professor). Depois
                que ele aceitar, selecione o login dele aqui pra vincular.
              </p>
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label htmlFor="prof-active">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Inativos somem dos forms novos mas preservam o histórico.
                </p>
              </div>
              <Switch id="prof-active" checked={active} onCheckedChange={setActive} />
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label htmlFor="prof-owner">É o gestor (dono)</Label>
                <p className="text-xs text-muted-foreground">
                  As aulas dele NÃO entram no total a repassar dos professores —
                  aparecem numa seção exclusiva na tela e no relatório.
                </p>
              </div>
              <Switch id="prof-owner" checked={isOwner} onCheckedChange={setIsOwner} />
            </div>
            {professor && professor.active && !active && professor.activeSlots > 0 ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                Ao inativar, as {professor.activeSlots} aula(s) da grade dele serão
                desativadas (somem do cronograma e param de gerar check-in). O
                histórico — aulas dadas, presenças, notas fiscais — é preservado.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </>
  );
}

// v1.2-AS: foto do professor — thumbnail + upload com downscale no client.
async function downscaleImg(file: File, maxDim = 800, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

function ProfessorPhoto({
  professorId,
  hasPhoto,
  name,
}: {
  professorId: string;
  hasPhoto: boolean;
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [ver, setVer] = useState(0);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Selecione uma imagem");
    startTransition(async () => {
      const blob = await downscaleImg(file);
      if (blob.size > 4 * 1024 * 1024) return void toast.error("Imagem grande demais (máx. 4 MB)");
      const fd = new FormData();
      fd.set("professorId", professorId);
      fd.set("photo", new File([blob], "prof.jpg", { type: blob.type || "image/jpeg" }));
      const r = await uploadProfessorPhoto(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Foto salva");
      setVer((v) => v + 1);
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const r = await removeProfessorPhoto({ professorId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Foto removida");
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="grid h-16 w-16 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground hover:bg-accent"
        title={hasPhoto ? "Trocar foto" : "Adicionar foto"}
      >
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/professor/${professorId}/photo?v=${ver}`} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-5 w-5" />
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {hasPhoto ? (
        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={remove} disabled={pending}>
          <X className="mr-1 h-3.5 w-3.5" /> Remover
        </Button>
      ) : null}
    </div>
  );
}
