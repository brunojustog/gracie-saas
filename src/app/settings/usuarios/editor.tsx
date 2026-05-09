"use client";

import type { Role } from "@prisma/client";
import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { inviteUser, updateMembership } from "./actions";

type Member = {
  userId: string;
  name: string | null;
  email: string;
  role: Role;
  active: boolean;
  emailVerified: boolean;
  isSuperAdmin: boolean;
};

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "SELLER", label: "Seller" },
];

export function UsersEditor({
  memberships,
  currentUserId,
}: {
  memberships: Member[];
  currentUserId: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Usuários</h2>
          <p className="text-xs text-muted-foreground">
            Membros desse tenant. Convide novos por email; alterações de role
            valem na próxima request do convidado.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Convidar usuário
        </Button>
      </div>

      {lastInviteUrl ? (
        <div className="rounded border border-dashed bg-muted/30 p-3 text-xs">
          <p className="mb-1 font-medium">Email de convite enviado.</p>
          <p className="text-muted-foreground">
            Em modo dev sem Resend configurado, copie o link manualmente:
          </p>
          <code className="mt-1 block break-all rounded bg-background p-2 font-mono">
            {lastInviteUrl}
          </code>
        </div>
      ) : null}

      <ul className="space-y-2">
        {memberships.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            isSelf={m.userId === currentUserId}
          />
        ))}
      </ul>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          {inviteOpen ? (
            <InviteForm
              onSent={(url) => {
                setLastInviteUrl(url);
                setInviteOpen(false);
              }}
              onClose={() => setInviteOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  const updateRole = (newRole: Role) => {
    startTransition(async () => {
      const result = await updateMembership({
        userId: member.userId,
        role: newRole,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role atualizado");
    });
  };

  const toggleActive = (active: boolean) => {
    startTransition(async () => {
      const result = await updateMembership({ userId: member.userId, active });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(active ? "Usuário reativado" : "Usuário desativado");
    });
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-medium">
          {member.name ?? member.email.split("@")[0]}
          {isSelf && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              você
            </span>
          )}
          {member.isSuperAdmin && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              super
            </span>
          )}
          {!member.emailVerified && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              convite pendente
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{member.email}</div>
      </div>

      <Select
        value={member.role}
        onValueChange={(v) => updateRole(v as Role)}
        disabled={pending || isSelf}
      >
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 text-xs">
        <Switch
          checked={member.active}
          onCheckedChange={toggleActive}
          disabled={pending || isSelf}
          aria-label="Ativo"
        />
        <span className="text-muted-foreground">{member.active ? "ativo" : "inativo"}</span>
      </div>
    </li>
  );
}

function InviteForm({
  onSent,
  onClose,
}: {
  onSent: (inviteUrl: string) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SELLER");
  const [pending, startTransition] = useTransition();

  const handleSend = () => {
    if (!email.includes("@")) {
      toast.error("Email inválido");
      return;
    }
    startTransition(async () => {
      const result = await inviteUser({ email: email.trim().toLowerCase(), role });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.mode === "sent") {
        toast.success("Convite enviado por email");
      } else {
        toast.info("Resend não configurado — link no painel abaixo + console");
      }
      onSent(result.inviteUrl);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar usuário</DialogTitle>
        <DialogDescription>
          Um email com link de ativação válido por 7 dias será enviado.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="exemplo@gracie.com"
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="role">Função</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={pending}>
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSend} disabled={pending}>
          {pending ? "Enviando…" : "Enviar convite"}
        </Button>
      </DialogFooter>
    </>
  );
}
