"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
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

import { createProfessor, updateProfessor } from "./actions";

type Professor = {
  id: string;
  name: string;
  active: boolean;
  email: string | null;
  userId: string | null;
  hourlyRate: number;
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
          })
        : await createProfessor({ name: name.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(professor ? "Professor atualizado" : "Professor criado");
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
