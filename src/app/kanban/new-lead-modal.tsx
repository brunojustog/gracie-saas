"use client";

import { Gender, LeadOrigin } from "@prisma/client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BeltSelect } from "@/components/belt-select";
import { guessGender } from "@/server/gender";

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
import { Textarea } from "@/components/ui/textarea";

import { createManualLead } from "./lead-actions";
import { ORIGIN_LABEL } from "./lead-card";

const NO_MODALITY = "__none__";
const UNASSIGNED = "__unassigned__";
const GENDER_AUTO = "__auto__";

const ORIGIN_ORDER: LeadOrigin[] = [
  "WHATSAPP",
  "INSTAGRAM_DIRECT",
  "FACEBOOK",
  "MANYCHAT",
  "LINK_BIO",
  "WEBSITE",
  "GOOGLE_ADS",
  "REFERRAL",
  "WALK_IN",
  "PHONE",
  "PHONE_CALL",
  "HOSPITAL_PARTNERSHIP",
  "OTHER",
];

type Modality = { id: string; name: string };
type Seller = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modalities: Modality[];
  sellers: Seller[];
  /** SELLER só pode atribuir a si mesma; o caller resolve esse default. */
  defaultSellerId?: string | null;
  onCreated?: (leadId: string) => void;
};

export function NewLeadModal({
  open,
  onOpenChange,
  modalities,
  sellers,
  defaultSellerId,
  onCreated,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <ModalBody
            // key força reset do form a cada abertura
            key={String(open)}
            onClose={() => onOpenChange(false)}
            modalities={modalities}
            sellers={sellers}
            defaultSellerId={defaultSellerId}
            onCreated={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  onClose,
  modalities,
  sellers,
  defaultSellerId,
  onCreated,
}: {
  onClose: () => void;
  modalities: Modality[];
  sellers: Seller[];
  defaultSellerId?: string | null;
  onCreated?: (leadId: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [origin, setOrigin] = useState<LeadOrigin>("WALK_IN");
  const [gender, setGender] = useState<Gender | "">("");
  const [belt, setBelt] = useState("");
  const [beltDegree, setBeltDegree] = useState(0);
  const [modalityId, setModalityId] = useState<string>(NO_MODALITY);
  const [sellerId, setSellerId] = useState<string>(defaultSellerId ?? UNASSIGNED);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const canSubmit = name.trim().length > 0 && !pending;

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createManualLead({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        origin,
        // Em branco → adivinha pelo primeiro nome (vendedora revisa depois).
        gender: gender || guessGender(name) || null,
        belt: belt || null,
        beltDegree: belt ? beltDegree : null,
        modalityId: modalityId === NO_MODALITY ? null : modalityId,
        assignedSellerId: sellerId === UNASSIGNED ? null : sellerId,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.welcomeEnqueued
          ? "Lead criado — cadência de follow-up agendada"
          : "Lead criado",
      );
      onCreated?.(result.leadId);
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>
          Cadastro manual — pra leads vindos de fora do Chatwoot (walk-in, indicação no balcão, etc).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <div className="space-y-1">
          <Label htmlFor="nl-name">
            Nome <span className="text-red-500">*</span>
          </Label>
          <Input
            id="nl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
            disabled={pending}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="nl-phone">Telefone</Label>
            <Input
              id="nl-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 9..."
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-email">Email</Label>
            <Input
              id="nl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="—"
              disabled={pending}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="nl-origin">
              Origem <span className="text-red-500">*</span>
            </Label>
            <Select
              value={origin}
              onValueChange={(v) => setOrigin(v as LeadOrigin)}
              disabled={pending}
            >
              <SelectTrigger id="nl-origin">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGIN_ORDER.map((o) => (
                  <SelectItem key={o} value={o}>
                    {ORIGIN_LABEL[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-gender">Gênero</Label>
            <Select
              value={gender === "" ? GENDER_AUTO : gender}
              onValueChange={(v) => setGender(v === GENDER_AUTO ? "" : (v as Gender))}
              disabled={pending}
            >
              <SelectTrigger id="nl-gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENDER_AUTO}>Automático (pelo nome)</SelectItem>
                <SelectItem value="FEMALE">Feminino</SelectItem>
                <SelectItem value="MALE">Masculino</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="nl-modality">Modalidade</Label>
            <Select
              value={modalityId}
              onValueChange={setModalityId}
              disabled={pending}
            >
              <SelectTrigger id="nl-modality">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODALITY}>—</SelectItem>
                {modalities.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nl-seller">Vendedora</Label>
            <Select value={sellerId} onValueChange={setSellerId} disabled={pending}>
              <SelectTrigger id="nl-seller">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>(sem vendedora)</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <BeltSelect
          belt={belt}
          degree={beltDegree}
          onBeltChange={setBelt}
          onDegreeChange={setBeltDegree}
          disabled={pending}
          idPrefix="nl"
        />

        <div className="space-y-1">
          <Label htmlFor="nl-notes">Observações</Label>
          <Textarea
            id="nl-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notas internas (não enviadas ao lead)…"
            disabled={pending}
          />
        </div>

        <p className="text-[11px] text-muted-foreground">
          Quando há telefone preenchido e o follow-up automático está ligado, a cadência de boas-vindas é agendada na hora.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleCreate} disabled={!canSubmit}>
          {pending ? "Criando…" : "Criar lead"}
        </Button>
      </DialogFooter>
    </>
  );
}
