"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  type LeadDetails,
  assignSeller,
  getLeadDetails,
  setModality,
  updateLeadInfo,
} from "./lead-actions";
import { moveLeadToStage } from "./actions";

const UNASSIGNED = "__unassigned__";
const NO_MODALITY = "__none__";

type Stage = {
  id: string;
  name: string;
  color: string;
  isWon: boolean;
  isLost: boolean;
};

type Modality = { id: string; name: string };
type Seller = { id: string; name: string };

/** Subset do Lead que o KanbanBoard mantém — usado pra refletir mudanças no card. */
export type LeadCardPatch = {
  name?: string;
  phone?: string | null;
  stageId?: string;
  modalityId?: string | null;
  modality?: { id: string; name: string } | null;
  assignedSellerId?: string | null;
  assignedSeller?: { id: string; name: string | null; email: string } | null;
  lastInteractionAt?: Date;
};

type Props = {
  leadId: string | null;
  onClose: () => void;
  /** Se o user logado é ADMIN ou MANAGER (controla quem pode reatribuir). */
  canReassign: boolean;
  stages: Stage[];
  modalities: Modality[];
  sellers: Seller[];
  /** Sheet repassa pro board pra refletir mudanças no card sem refetch. */
  onLeadPatch: (leadId: string, patch: LeadCardPatch) => void;
};

export function LeadSheet(props: Props) {
  const { leadId, onClose } = props;
  return (
    <Sheet
      open={leadId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {leadId !== null ? <LeadLoader key={leadId} {...props} leadId={leadId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Componente interno que monta UMA vez por leadId — o `key={leadId}` no LeadSheet
 * faz remount quando o user troca de card, então o state interno reseta natural,
 * sem precisar `setLead(null)` direto no effect (anti-pattern do react-hooks).
 */
function LeadLoader({
  leadId,
  onClose,
  canReassign,
  stages,
  modalities,
  sellers,
  onLeadPatch,
}: Props & { leadId: string }) {
  const [lead, setLead] = useState<LeadDetails | null>(null);

  useEffect(() => {
    let aborted = false;
    getLeadDetails(leadId).then((data) => {
      if (aborted) return;
      setLead(data);
      if (!data) {
        toast.error("Lead não encontrado ou sem permissão");
        onClose();
      }
    });
    return () => {
      aborted = true;
    };
  }, [leadId, onClose]);

  if (!lead) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  return (
    <LeadSheetContent
      lead={lead}
      canReassign={canReassign}
      stages={stages}
      modalities={modalities}
      sellers={sellers}
      onLeadChange={setLead}
      onLeadPatch={onLeadPatch}
    />
  );
}

function LeadSheetContent({
  lead,
  canReassign,
  stages,
  modalities,
  sellers,
  onLeadChange,
  onLeadPatch,
}: {
  lead: LeadDetails;
  canReassign: boolean;
  stages: Stage[];
  modalities: Modality[];
  sellers: Seller[];
  onLeadChange: (lead: LeadDetails) => void;
  onLeadPatch: (leadId: string, patch: LeadCardPatch) => void;
}) {
  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: lead.stage.color }}
            aria-hidden
          />
          <SheetTitle>{lead.name}</SheetTitle>
        </div>
        <SheetDescription>
          em <span className="font-medium">{lead.stage.name}</span> · última
          interação{" "}
          {formatDistanceToNow(new Date(lead.lastInteractionAt), {
            locale: ptBR,
            addSuffix: true,
          })}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="classes">Aulas</TabsTrigger>
          <TabsTrigger value="conversations">Conversas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          <OverviewTab
            lead={lead}
            canReassign={canReassign}
            stages={stages}
            modalities={modalities}
            sellers={sellers}
            onLeadChange={onLeadChange}
            onLeadPatch={onLeadPatch}
          />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <HistoryTab lead={lead} />
        </TabsContent>

        <TabsContent value="classes" className="pt-4">
          <p className="text-sm text-muted-foreground">
            Agendamento e checagem de aulas experimentais entram na fase 8.
          </p>
        </TabsContent>

        <TabsContent value="conversations" className="space-y-2 pt-4">
          {lead.chatwootConversationId ? (
            <p className="text-sm">
              Esse lead foi criado via Chatwoot (conversation #
              {lead.chatwootConversationId}).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este lead não tem conversa do Chatwoot vinculada.
            </p>
          )}
          {lead.chatwootContactId ? (
            <p className="text-xs text-muted-foreground">
              chatwoot contact id: {lead.chatwootContactId}
            </p>
          ) : null}
          <p className="pt-2 text-xs text-muted-foreground">
            Deep-link direto pro Chatwoot virá quando configurarmos a URL base
            do tenant em /settings.
            <ExternalLink className="ml-1 inline h-3 w-3" />
          </p>
        </TabsContent>
      </Tabs>
    </>
  );
}

function OverviewTab({
  lead,
  canReassign,
  stages,
  modalities,
  sellers,
  onLeadChange,
  onLeadPatch,
}: {
  lead: LeadDetails;
  canReassign: boolean;
  stages: Stage[];
  modalities: Modality[];
  sellers: Seller[];
  onLeadChange: (lead: LeadDetails) => void;
  onLeadPatch: (leadId: string, patch: LeadCardPatch) => void;
}) {
  const [pending, startTransition] = useTransition();

  // Form local pra dados editáveis (commit on blur OU click "Salvar")
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");

  const dirty =
    name !== lead.name ||
    (phone || "") !== (lead.phone ?? "") ||
    (email || "") !== (lead.email ?? "") ||
    (notes || "") !== (lead.notes ?? "");

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateLeadInfo({
        leadId: lead.id,
        name,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Dados atualizados");
      onLeadChange({ ...lead, name, phone, email, notes });
      onLeadPatch(lead.id, { name, phone: phone || null });
    });
  };

  const handleStageChange = (stageId: string) => {
    if (stageId === lead.stage.id) return;
    startTransition(async () => {
      const result = await moveLeadToStage({ leadId: lead.id, toStageId: stageId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const newStage = stages.find((s) => s.id === stageId);
      if (newStage) {
        toast.success(`Movido para ${newStage.name}`);
        onLeadChange({
          ...lead,
          stageId,
          stage: { id: newStage.id, name: newStage.name, color: newStage.color },
        });
        onLeadPatch(lead.id, { stageId });
      }
    });
  };

  const handleAssign = (sellerId: string) => {
    const value = sellerId === UNASSIGNED ? null : sellerId;
    startTransition(async () => {
      const result = await assignSeller({ leadId: lead.id, sellerId: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const seller = value ? sellers.find((s) => s.id === value) : null;
      toast.success(seller ? `Atribuído a ${seller.name}` : "Atribuição removida");
      const sellerForCard = seller
        ? { id: seller.id, name: seller.name, email: "" }
        : null;
      onLeadChange({
        ...lead,
        assignedSellerId: value,
        assignedSeller: sellerForCard,
      });
      onLeadPatch(lead.id, {
        assignedSellerId: value,
        assignedSeller: sellerForCard,
      });
    });
  };

  const handleModality = (modalityId: string) => {
    const value = modalityId === NO_MODALITY ? null : modalityId;
    startTransition(async () => {
      const result = await setModality({ leadId: lead.id, modalityId: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const modality = value ? modalities.find((m) => m.id === value) : null;
      toast.success(modality ? `Modalidade: ${modality.name}` : "Modalidade removida");
      const modalityForCard = modality ? { id: modality.id, name: modality.name } : null;
      onLeadChange({
        ...lead,
        modalityId: value,
        modality: modalityForCard,
      });
      onLeadPatch(lead.id, {
        modalityId: value,
        modality: modalityForCard,
      });
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="stage">Estágio</Label>
          <Select value={lead.stage.id} onValueChange={handleStageChange} disabled={pending}>
            <SelectTrigger id="stage" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="modality">Modalidade</Label>
          <Select
            value={lead.modalityId ?? NO_MODALITY}
            onValueChange={handleModality}
            disabled={pending}
          >
            <SelectTrigger id="modality" className="h-9">
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
      </div>

      <div className="space-y-1">
        <Label htmlFor="seller">Vendedora</Label>
        {canReassign ? (
          <Select
            value={lead.assignedSellerId ?? UNASSIGNED}
            onValueChange={handleAssign}
            disabled={pending}
          >
            <SelectTrigger id="seller" className="h-9">
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
        ) : (
          <p className="text-sm">
            {lead.assignedSeller?.name ?? lead.assignedSeller?.email ?? "(sem vendedora)"}
            <span className="ml-2 text-xs text-muted-foreground">
              só admin/manager pode reatribuir
            </span>
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9"
            placeholder="+55 11 9..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
            placeholder="—"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Notas internas (não enviadas ao lead)…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 border-t pt-4 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Origem:</span>{" "}
          {lead.origin.toLowerCase().replace("_", " ")}
        </div>
        <div>
          <span className="font-medium text-foreground">Criado em:</span>{" "}
          {format(new Date(lead.firstInteractionAt), "dd/MM/yyyy")}
        </div>
      </div>

      <Button onClick={handleSave} disabled={!dirty || pending} className="w-full">
        {pending ? "Salvando…" : "Salvar alterações"}
      </Button>
    </div>
  );
}

function HistoryTab({ lead }: { lead: LeadDetails }) {
  if (lead.history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem movimentações registradas.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {lead.history.map((h) => {
        const who = h.changedBy?.name ?? h.changedBy?.email ?? "sistema";
        return (
          <li key={h.id} className="flex gap-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ background: h.toStage.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-medium">{h.toStage.name}</span>
                <span className="text-muted-foreground"> · {who}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(h.changedAt), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </div>
              {h.notes ? (
                <div className="mt-1 text-xs italic text-muted-foreground">
                  {h.notes}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
