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

import { getClassesForLead } from "./../aulas/actions";
import { EnrollmentModal } from "./../matriculas/enrollment-modal";
import { getSalesForLeadAction } from "./../pdv/actions";

import {
  type LeadDetails,
  assignSeller,
  getLeadDetails,
  setLeadTags,
  setModality,
  updateLeadInfo,
} from "./lead-actions";
import { moveLeadToStage } from "./actions";
import { TagEditor } from "./tag-editor";

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
  tags?: string[];
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="classes">Aulas</TabsTrigger>
          <TabsTrigger value="purchases">Compras</TabsTrigger>
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
          <ClassesTab leadId={lead.id} leadName={lead.name} />
        </TabsContent>

        <TabsContent value="purchases" className="pt-4">
          <PurchasesTab leadId={lead.id} leadName={lead.name} />
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

  const handleTagsChange = (next: string[]) => {
    // Otimista: atualiza local + board imediatamente, depois persiste.
    onLeadChange({ ...lead, tags: next });
    onLeadPatch(lead.id, { tags: next });
    startTransition(async () => {
      const result = await setLeadTags({ leadId: lead.id, tags: next });
      if (!result.ok) {
        toast.error(result.error);
        // Reverte
        onLeadChange({ ...lead });
        onLeadPatch(lead.id, { tags: lead.tags ?? [] });
      }
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

      <div className="space-y-1">
        <Label>Tags</Label>
        <TagEditor
          value={lead.tags ?? []}
          onChange={(next) => handleTagsChange(next)}
          disabled={pending}
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

      <EnrollmentSection lead={lead} />
    </div>
  );
}

function EnrollmentSection({ lead }: { lead: LeadDetails }) {
  const [open, setOpen] = useState(false);

  if (lead.enrollment) {
    const e = lead.enrollment;
    const value = Number(e.monthlyValue);
    const tone =
      e.status === "ACTIVE"
        ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30"
        : e.status === "CANCELED"
          ? "border-red-500/40 bg-red-50 dark:bg-red-950/30"
          : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30";
    return (
      <div className={`rounded-lg border ${tone} p-3 text-sm`}>
        <div className="font-medium">
          Matriculado em {format(new Date(e.enrolledAt), "dd/MM/yyyy")}
        </div>
        <div className="text-xs text-muted-foreground">
          {e.modality.name} · {e.plan.name} ·{" "}
          {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês ·{" "}
          {e.status.toLowerCase()}
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="default"
        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
        onClick={() => setOpen(true)}
      >
        Marcar como matriculado
      </Button>
      <EnrollmentModal
        open={open}
        onOpenChange={setOpen}
        presetLead={{
          id: lead.id,
          name: lead.name,
          modalityId: lead.modalityId,
        }}
        onCreated={() => {
          setOpen(false);
          // Próxima abertura do sheet vai trazer o enrollment via getLeadDetails
          // (server action revalidatePath('/kanban') invalida o cache)
          window.location.reload();
        }}
      />
    </>
  );
}

type LeadClass = NonNullable<
  Awaited<ReturnType<typeof getClassesForLead>>
>[number];

function ClassesTab({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [classes, setClasses] = useState<LeadClass[] | null>(null);

  useEffect(() => {
    let aborted = false;
    getClassesForLead(leadId).then((data) => {
      if (!aborted) setClasses(data ?? []);
    });
    return () => {
      aborted = true;
    };
  }, [leadId]);

  if (classes === null) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {leadName} ainda não tem aulas experimentais agendadas.
        </p>
        <a
          href="/aulas"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Abrir calendário para agendar →
        </a>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {classes.map((c) => (
        <li
          key={c.id}
          className="flex items-start gap-3 rounded border bg-card p-3"
        >
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ background: c.modality.color ?? "#6B7280" }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{c.modality.name}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(c.scheduledDate), "EEE, dd MMM 'às' HH:mm", { locale: ptBR })}
            </div>
            {c.notes ? (
              <div className="mt-1 text-xs italic text-muted-foreground">{c.notes}</div>
            ) : null}
          </div>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
            {c.status.toLowerCase().replace("_", " ")}
          </span>
        </li>
      ))}
    </ol>
  );
}

type LeadSale = NonNullable<
  Awaited<ReturnType<typeof getSalesForLeadAction>>
>[number];

function PurchasesTab({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [sales, setSales] = useState<LeadSale[] | null>(null);

  useEffect(() => {
    let aborted = false;
    getSalesForLeadAction(leadId).then((data) => {
      if (!aborted) setSales(data ?? []);
    });
    return () => {
      aborted = true;
    };
  }, [leadId]);

  if (sales === null) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {leadName} ainda não tem compras registradas.
        </p>
        <a
          href="/pdv"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Abrir PDV →
        </a>
      </div>
    );
  }

  const totalLifetime = sales.reduce((s, sale) => s + sale.total, 0);

  return (
    <div className="space-y-3">
      <div className="rounded border bg-muted/40 p-2 text-xs">
        <span className="font-medium">Total comprado:</span>{" "}
        {totalLifetime.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}{" "}
        em {sales.length} venda{sales.length === 1 ? "" : "s"}
      </div>
      <ol className="space-y-2">
        {sales.map((sale) => (
          <li key={sale.id} className="rounded border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {format(new Date(sale.paidAt), "dd/MM/yyyy HH:mm", {
                  locale: ptBR,
                })}{" "}
                · {sale.paymentMethod.toLowerCase().replace("_", " ")}
              </div>
              <span className="text-sm font-semibold">
                {sale.total.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs">
              {sale.items.map((i) => (
                <li key={i.id}>
                  {i.quantity}× {i.productVariant.product.name}
                  {i.productVariant.label !== "Padrão"
                    ? ` (${i.productVariant.label})`
                    : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
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
