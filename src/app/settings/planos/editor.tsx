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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { upsertPlan } from "./actions";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  monthlyValue: number;
  setupFee: number | null;
  modalityId: string | null;
  modalityName: string | null;
  active: boolean;
};

const NO_MODALITY = "__none__";

export function PlansEditor({
  plans,
  modalities,
}: {
  plans: Plan[];
  modalities: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const open = creating || editing !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="text-xs text-muted-foreground">
            Pacotes mensais de matrícula. Plano sem modalidade é &quot;global&quot; — disponível
            ao matricular em qualquer turma.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Novo plano
        </Button>
      </div>

      <ul className="space-y-2">
        {plans.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
              !p.active && "opacity-60"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {p.name}
                {!p.active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    inativo
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.monthlyValue.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                /mês{p.setupFee ? ` · setup ${p.setupFee.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                {p.modalityName ? ` · ${p.modalityName}` : " · global"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
              Editar
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {open ? (
            <PlanFormBody
              key={editing?.id ?? "new"}
              plan={editing}
              modalities={modalities}
              onClose={() => {
                setEditing(null);
                setCreating(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanFormBody({
  plan,
  modalities,
  onClose,
}: {
  plan: Plan | null;
  modalities: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [monthlyValue, setMonthlyValue] = useState(
    plan ? String(plan.monthlyValue) : "",
  );
  const [setupFee, setSetupFee] = useState(
    plan?.setupFee != null ? String(plan.setupFee) : "",
  );
  const [modalityId, setModalityId] = useState(plan?.modalityId ?? NO_MODALITY);
  const [active, setActive] = useState(plan?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const value = Number(monthlyValue.replace(",", "."));
    if (!name.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error("Nome e valor mensal são obrigatórios");
      return;
    }
    const fee = setupFee ? Number(setupFee.replace(",", ".")) : null;
    startTransition(async () => {
      const result = await upsertPlan({
        id: plan?.id,
        name: name.trim(),
        description: description.trim() || null,
        monthlyValue: value,
        setupFee: fee,
        modalityId: modalityId === NO_MODALITY ? null : modalityId,
        active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(plan ? "Plano atualizado" : "Plano criado");
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desc">Descrição</Label>
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="value">Valor mensal (R$)</Label>
            <Input
              id="value"
              type="number"
              step="0.01"
              value={monthlyValue}
              onChange={(e) => setMonthlyValue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="setup">Taxa de setup (R$)</Label>
            <Input
              id="setup"
              type="number"
              step="0.01"
              value={setupFee}
              onChange={(e) => setSetupFee(e.target.value)}
              placeholder="opcional"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="modality">Modalidade (opcional)</Label>
          <Select value={modalityId} onValueChange={setModalityId}>
            <SelectTrigger id="modality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MODALITY}>Global (qualquer modalidade)</SelectItem>
              {modalities.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {plan ? (
          <div className="flex items-center justify-between rounded border p-3">
            <Label htmlFor="active">Ativo</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
          </div>
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
