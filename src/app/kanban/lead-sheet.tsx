"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCheck,
  Circle,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Pause,
  PencilLine,
  Play,
  Snowflake,
  SkipForward,
  Sparkles,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { Gender, LeadNoteKind, LeadOrigin, MessageJobStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FollowUpStatus } from "@/server/messaging/status";
import { getTemplate } from "@/server/messaging/templates";

import { getClassesForLead } from "./../aulas/actions";
import {
  cancelEnrollment,
  reactivateEnrollment,
  suspendEnrollment,
} from "./../matriculas/actions";
import { EnrollmentModal } from "./../matriculas/enrollment-modal";
import { getSalesForLeadAction } from "./../pdv/actions";

import {
  type LeadDetails,
  addLeadNote,
  assignSeller,
  deleteLead,
  getLeadDetails,
  getLeadFollowUp,
  getLeadNotes,
  setLeadOrigin,
  setLeadTags,
  setModality,
  toggleLeadFollowUp,
  updateLeadInfo,
} from "./lead-actions";
import { moveLeadToStage } from "./actions";
import { ORIGIN_LABEL } from "./lead-card";
import { TagEditor } from "./tag-editor";

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

const UNASSIGNED = "__unassigned__";
const NO_MODALITY = "__none__";
const GENDER_NONE = "__none__";

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
  origin?: LeadOrigin;
  followUp?: {
    enabled: boolean;
    summary:
      | "idle"
      | "running"
      | "paused"
      | "tenantOff"
      | "completed"
      | "responded"
      | "failed";
    currentStep: number | null;
    totalSteps: number;
  } | null;
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
      onClose={onClose}
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
  onClose,
}: {
  lead: LeadDetails;
  canReassign: boolean;
  stages: Stage[];
  modalities: Modality[];
  sellers: Seller[];
  onLeadChange: (lead: LeadDetails) => void;
  onLeadPatch: (leadId: string, patch: LeadCardPatch) => void;
  onClose: () => void;
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
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
            onClose={onClose}
          />
        </TabsContent>

        <TabsContent value="followup" className="pt-4">
          <FollowUpTab leadId={lead.id} leadName={lead.name} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <HistoryTab leadId={lead.id} />
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
  onClose,
}: {
  lead: LeadDetails;
  canReassign: boolean;
  stages: Stage[];
  modalities: Modality[];
  sellers: Seller[];
  onLeadChange: (lead: LeadDetails) => void;
  onLeadPatch: (leadId: string, patch: LeadCardPatch) => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  // Form local pra dados editáveis (commit on blur OU click "Salvar")
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [gender, setGender] = useState<Gender | "">(lead.gender ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");

  const dirty =
    name !== lead.name ||
    (phone || "") !== (lead.phone ?? "") ||
    (email || "") !== (lead.email ?? "") ||
    (gender || "") !== (lead.gender ?? "") ||
    (notes || "") !== (lead.notes ?? "");

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateLeadInfo({
        leadId: lead.id,
        name,
        phone: phone || null,
        email: email || null,
        gender: gender || null,
        notes: notes || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Dados atualizados");
      onLeadChange({ ...lead, name, phone, email, gender: gender || null, notes });
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

  const handleOriginChange = (next: string) => {
    const value = next as LeadOrigin;
    if (value === lead.origin) return;
    startTransition(async () => {
      const result = await setLeadOrigin({ leadId: lead.id, origin: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Origem: ${ORIGIN_LABEL[value]}`);
      onLeadChange({ ...lead, origin: value });
      onLeadPatch(lead.id, { origin: value });
    });
  };

  const handleFollowUpToggle = (next: boolean) => {
    // Otimista — reverte se falhar.
    const previousFollowUp = lead.followUpEnabled;
    onLeadChange({ ...lead, followUpEnabled: next });
    startTransition(async () => {
      const result = await toggleLeadFollowUp({ leadId: lead.id, enabled: next });
      if (!result.ok) {
        toast.error(result.error);
        onLeadChange({ ...lead, followUpEnabled: previousFollowUp });
        return;
      }
      toast.success(next ? "Follow-up reativado" : "Follow-up pausado nesse lead");
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="origin">Origem</Label>
          <Select
            value={lead.origin}
            onValueChange={handleOriginChange}
            disabled={pending}
          >
            <SelectTrigger id="origin" className="h-9">
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
          <Label htmlFor="gender">Gênero</Label>
          <Select
            value={gender === "" ? GENDER_NONE : gender}
            onValueChange={(v) => setGender(v === GENDER_NONE ? "" : (v as Gender))}
            disabled={pending}
          >
            <SelectTrigger id="gender" className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENDER_NONE}>Não informado</SelectItem>
              <SelectItem value="FEMALE">Feminino</SelectItem>
              <SelectItem value="MALE">Masculino</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground">Criado em</Label>
        <div className="flex h-9 items-center text-sm">
          {format(new Date(lead.firstInteractionAt), "dd/MM/yyyy")}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-0.5">
          <Label htmlFor="overview-followup-toggle" className="cursor-pointer text-sm font-medium">
            Follow-up automático
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Quando desligado, esse lead para de receber a cadência. Detalhes
            na aba <strong>Follow-up</strong>.
          </p>
        </div>
        <Switch
          id="overview-followup-toggle"
          checked={lead.followUpEnabled}
          onCheckedChange={handleFollowUpToggle}
          disabled={pending}
        />
      </div>

      <Button onClick={handleSave} disabled={!dirty || pending} className="w-full">
        {pending ? "Salvando…" : "Salvar alterações"}
      </Button>

      <EnrollmentSection lead={lead} />

      <DangerZone lead={lead} onClose={onClose} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Follow-up tab
// ──────────────────────────────────────────────────────────────────────────

const SUMMARY_LABEL: Record<FollowUpStatus["summary"], string> = {
  idle: "Sem cadência ativa",
  running: "Cadência em andamento",
  paused: "Pausado neste lead",
  tenantOff: "Follow-up global desligado",
  completed: "Cadência concluída sem resposta",
  responded: "Lead respondeu — cadência pausada",
  failed: "Falha no envio",
};

const SUMMARY_TONE: Record<FollowUpStatus["summary"], string> = {
  idle: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
  running: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  paused: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300",
  tenantOff: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  responded: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  failed: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

function StatusIcon({ status }: { status: MessageJobStatus | "EMPTY" }) {
  switch (status) {
    case "SENT":
      return <CheckCheck className="h-4 w-4 text-emerald-600" aria-label="enviada" />;
    case "PENDING":
      return <Clock className="h-4 w-4 text-sky-600" aria-label="agendada" />;
    case "SKIPPED":
      return <SkipForward className="h-4 w-4 text-zinc-500" aria-label="pulada" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-600" aria-label="falhou" />;
    case "EMPTY":
      return <Circle className="h-4 w-4 text-zinc-300" aria-label="não enfileirada" />;
  }
}

function formatJobLine(job: {
  status: MessageJobStatus;
  scheduledAt: Date | string;
  sentAt: Date | string | null;
  errorMessage: string | null;
}): string {
  const d = (val: Date | string) => format(new Date(val), "dd/MM HH:mm", { locale: ptBR });
  switch (job.status) {
    case "SENT":
      return job.sentAt ? `enviada em ${d(job.sentAt)}` : "enviada";
    case "PENDING":
      return `agendada pra ${d(job.scheduledAt)}`;
    case "SKIPPED":
      return job.errorMessage ? `pulada — ${job.errorMessage}` : "pulada";
    case "FAILED":
      return job.errorMessage ? `falhou — ${job.errorMessage}` : "falhou";
  }
}

type FollowUpState =
  | { kind: "loading" }
  | { kind: "loaded"; data: FollowUpStatus }
  | { kind: "error" };

function FollowUpTab({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [state, setState] = useState<FollowUpState>({ kind: "loading" });
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let aborted = false;
    getLeadFollowUp(leadId).then((data) => {
      if (aborted) return;
      setState(data ? { kind: "loaded", data } : { kind: "error" });
    });
    return () => {
      aborted = true;
    };
  }, [leadId]);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar o status de follow-up.
      </p>
    );
  }

  const status = state.data;

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    const previous = status;
    // Otimista — reverte se falhar.
    setState({
      kind: "loaded",
      data: {
        ...status,
        enabledForLead: next,
        summary: next ? (status.summary === "paused" ? "idle" : status.summary) : "paused",
      },
    });
    const result = await toggleLeadFollowUp({ leadId, enabled: next });
    setToggling(false);
    if (!result.ok) {
      setState({ kind: "loaded", data: previous });
      toast.error(result.error);
      return;
    }
    toast.success(next ? "Follow-up reativado" : "Follow-up pausado nesse lead");
    // Recarrega pra refletir o novo estado (jobs SKIPPED em massa quando desliga).
    const refreshed = await getLeadFollowUp(leadId);
    if (refreshed) setState({ kind: "loaded", data: refreshed });
  };

  return (
    <div className="space-y-5">
      <div className={cn("flex items-start justify-between gap-3 rounded-lg border p-3", SUMMARY_TONE[status.summary])}>
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{SUMMARY_LABEL[status.summary]}</div>
          <div className="text-xs opacity-80">
            {status.summary === "running" && status.currentStep
              ? `Próxima mensagem: M${status.currentStep} de ${status.totalSteps}`
              : null}
            {status.summary === "tenantOff"
              ? "Ative em Settings → WhatsApp pra liberar disparos."
              : null}
            {status.nextScheduledAt
              ? `Próximo disparo: ${format(new Date(status.nextScheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`
              : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="followup-toggle" className="text-xs">
            Automático
          </Label>
          <Switch
            id="followup-toggle"
            checked={status.enabledForLead}
            onCheckedChange={handleToggle}
            disabled={toggling || !status.enabledForTenant}
          />
        </div>
      </div>

      {!status.enabledForTenant ? (
        <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            O follow-up global está desligado em Settings → WhatsApp. Mesmo com
            o lead ligado, nenhuma mensagem dispara enquanto o master switch
            estiver off.
          </span>
        </div>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Etapa Novo Lead — 8 mensagens em ~7 dias
        </h4>
        <ol className="space-y-1.5">
          {status.welcome.map((slot) => {
            const label = getTemplate(slot.templateKey)?.label ?? slot.templateKey;
            const jobStatus = slot.job?.status ?? "EMPTY";
            return (
              <li
                key={slot.templateKey}
                className="flex items-start gap-2 rounded border bg-card px-2.5 py-2"
              >
                <StatusIcon status={jobStatus} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold">M{slot.step}</span>
                    <span className="truncate text-xs text-muted-foreground">{label}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {slot.job ? formatJobLine(slot.job) : "não enfileirada"}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-muted-foreground">
          {leadName.split(/\s+/)[0]} vai pra <strong>Nutrição</strong>{" "}
          automaticamente quando a M8 disparar sem resposta.
        </p>
      </section>

      {status.appointment.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lembretes de aula experimental
          </h4>
          <ol className="space-y-1.5">
            {status.appointment.map((job) => {
              const label = getTemplate(job.templateKey)?.label ?? job.templateKey;
              return (
                <li
                  key={job.id}
                  className="flex items-start gap-2 rounded border bg-card px-2.5 py-2"
                >
                  <StatusIcon status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">{label}</div>
                    <div className="text-[11px] text-muted-foreground">{formatJobLine(job)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {status.attendance.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pós-comparecimento
          </h4>
          <ol className="space-y-1.5">
            {status.attendance.map((job) => {
              const label = getTemplate(job.templateKey)?.label ?? job.templateKey;
              return (
                <li
                  key={job.id}
                  className="flex items-start gap-2 rounded border bg-card px-2.5 py-2"
                >
                  <StatusIcon status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">{label}</div>
                    <div className="text-[11px] text-muted-foreground">{formatJobLine(job)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function EnrollmentSection({ lead }: { lead: LeadDetails }) {
  const router = useRouter();
  const [openEnrollment, setOpenEnrollment] = useState(false);
  const [openFreeze, setOpenFreeze] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!lead.enrollment) {
    return (
      <>
        <Button
          variant="default"
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => setOpenEnrollment(true)}
        >
          Marcar como matriculado
        </Button>
        <EnrollmentModal
          open={openEnrollment}
          onOpenChange={setOpenEnrollment}
          presetLead={{
            id: lead.id,
            name: lead.name,
            modalityId: lead.modalityId,
          }}
          onCreated={() => {
            setOpenEnrollment(false);
            // Próxima abertura do sheet vai trazer o enrollment via getLeadDetails
            // (server action revalidatePath('/kanban') invalida o cache)
            window.location.reload();
          }}
        />
      </>
    );
  }

  const e = lead.enrollment;
  // null quando SELLER — servidor mascara em getLeadDetails pra não vazar.
  const value = e.monthlyValue !== null ? Number(e.monthlyValue) : null;
  const tone =
    e.status === "ACTIVE"
      ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30"
      : e.status === "CANCELED"
        ? "border-red-500/40 bg-red-50 dark:bg-red-950/30"
        : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30";

  const STATUS_LABEL: Record<typeof e.status, string> = {
    ACTIVE: "ativa",
    SUSPENDED: "congelada",
    CANCELED: "cancelada",
  };

  const handleReactivate = () => {
    startTransition(async () => {
      const result = await reactivateEnrollment({ enrollmentId: e.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula reativada");
      router.refresh();
    });
  };

  return (
    <>
      <div className={cn("space-y-2 rounded-lg border p-3 text-sm", tone)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">
              Matriculado em {format(new Date(e.enrolledAt), "dd/MM/yyyy")}
            </div>
            <div className="text-xs text-muted-foreground">
              {e.modality.name} · {e.plan.name}
              {value !== null ? (
                <>
                  {" · "}
                  {value.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  /mês
                </>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium uppercase">
            {STATUS_LABEL[e.status]}
          </span>
        </div>

        {e.status === "SUSPENDED" ? (
          <div className="space-y-0.5 border-t border-current/20 pt-2 text-xs">
            <div>
              <span className="text-muted-foreground">Congelada em:</span>{" "}
              {e.suspendedAt
                ? format(new Date(e.suspendedAt), "dd/MM/yyyy")
                : "—"}
            </div>
            {e.suspensionReason ? (
              <div>
                <span className="text-muted-foreground">Motivo:</span> {e.suspensionReason}
              </div>
            ) : null}
            <div>
              <span className="text-muted-foreground">Retorno previsto:</span>{" "}
              {e.expectedReturnAt
                ? format(new Date(e.expectedReturnAt), "dd/MM/yyyy")
                : "(sem prazo)"}
            </div>
          </div>
        ) : null}

        {e.status === "CANCELED" && e.canceledAt ? (
          <div className="border-t border-current/20 pt-2 text-xs text-muted-foreground">
            Cancelada em {format(new Date(e.canceledAt), "dd/MM/yyyy")}
          </div>
        ) : null}

        {e.status !== "CANCELED" ? (
          <div className="flex flex-wrap gap-2 border-t border-current/20 pt-2">
            {e.status === "ACTIVE" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenFreeze(true)}
                  disabled={pending}
                >
                  Congelar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  onClick={() => setOpenCancel(true)}
                  disabled={pending}
                >
                  Cancelar matrícula
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleReactivate}
                disabled={pending}
              >
                {pending ? "Reativando…" : "Reativar"}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <SuspendDialog
        enrollmentId={e.id}
        leadName={lead.name}
        open={openFreeze}
        onOpenChange={setOpenFreeze}
        onSuccess={() => router.refresh()}
      />
      <CancelEnrollmentDialog
        enrollmentId={e.id}
        leadName={lead.name}
        open={openCancel}
        onOpenChange={setOpenCancel}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}

function SuspendDialog({
  enrollmentId,
  leadName,
  open,
  onOpenChange,
  onSuccess,
}: {
  enrollmentId: string;
  leadName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <SuspendDialogBody
            enrollmentId={enrollmentId}
            leadName={leadName}
            onCancel={() => onOpenChange(false)}
            onSuccess={() => {
              onOpenChange(false);
              onSuccess();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SuspendDialogBody({
  enrollmentId,
  leadName,
  onCancel,
  onSuccess,
}: {
  enrollmentId: string;
  leadName: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  // Mount-on-open: o pai só renderiza este componente quando `open=true`,
  // então o state inicial vale a cada abertura sem precisar de useEffect.
  const [reason, setReason] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo do congelamento");
      return;
    }
    startTransition(async () => {
      const result = await suspendEnrollment({
        enrollmentId,
        reason: reason.trim(),
        expectedReturnAt: expectedReturnAt || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula congelada");
      onSuccess();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Congelar matrícula</DialogTitle>
        <DialogDescription>
          {leadName} — fica pausado até reativar manualmente. Lead recebe a tag &quot;Congelado&quot; no kanban.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="freeze-reason">
            Motivo <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="freeze-reason"
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            rows={3}
            placeholder="ex: lesão no joelho, viagem 3 meses, problemas financeiros…"
            disabled={pending}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="freeze-return">Data prevista de retorno (opcional)</Label>
          <Input
            id="freeze-return"
            type="date"
            value={expectedReturnAt}
            onChange={(ev) => setExpectedReturnAt(ev.target.value)}
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            Sem data, fica como &quot;congelado sem prazo&quot;.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={pending}>
          {pending ? "Congelando…" : "Confirmar congelamento"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelEnrollmentDialog({
  enrollmentId,
  leadName,
  open,
  onOpenChange,
  onSuccess,
}: {
  enrollmentId: string;
  leadName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <CancelEnrollmentDialogBody
            enrollmentId={enrollmentId}
            leadName={leadName}
            onCancel={() => onOpenChange(false)}
            onSuccess={() => {
              onOpenChange(false);
              onSuccess();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelEnrollmentDialogBody({
  enrollmentId,
  leadName,
  onCancel,
  onSuccess,
}: {
  enrollmentId: string;
  leadName: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [moveToLost, setMoveToLost] = useState(true);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await cancelEnrollment({
        enrollmentId,
        reason: reason || undefined,
        moveToLost,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula cancelada");
      onSuccess();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancelar matrícula</DialogTitle>
        <DialogDescription>
          {leadName} — cancelar é definitivo. Pra voltar, terá que criar uma nova matrícula.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            rows={3}
            placeholder="ex: mudou de cidade, motivo financeiro…"
            disabled={pending}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={moveToLost}
            onChange={(ev) => setMoveToLost(ev.target.checked)}
            disabled={pending}
            className="h-4 w-4"
          />
          Mover lead para &quot;Aluno Perdido&quot; no kanban
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
          {pending ? "Cancelando…" : "Confirmar cancelamento"}
        </Button>
      </DialogFooter>
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

// ──────────────────────────────────────────────────────────────────────────
// Diário (aba "Histórico")
// ──────────────────────────────────────────────────────────────────────────

type LeadNoteView = NonNullable<Awaited<ReturnType<typeof getLeadNotes>>>[number];

const NOTE_ICON: Record<LeadNoteKind, typeof CheckCheck> = {
  MANUAL: PencilLine,
  STAGE_CHANGED: ArrowRightLeft,
  ENROLLMENT_CREATED: GraduationCap,
  ENROLLMENT_UPDATED: PencilLine,
  ENROLLMENT_SUSPENDED: Snowflake,
  ENROLLMENT_REACTIVATED: Play,
  ENROLLMENT_CANCELED: XCircle,
  CLASS_SCHEDULED: CalendarClock,
  CLASS_ATTENDED: CalendarCheck,
  CLASS_NO_SHOW: CalendarX,
  CLASS_RESCHEDULED: CalendarClock,
  CLASS_CANCELED: CalendarX,
  WHATSAPP_REPLY: MessageCircle,
  FOLLOWUP_PAUSED: Pause,
  FOLLOWUP_RESUMED: Play,
  LEAD_CREATED: UserPlus,
  LEAD_DELETED: Trash2,
  LEAD_RESTORED: Play,
  MANYCHAT_EVENT: MessagesSquare,
  PAYMENT_CONFIRMED: Banknote,
};

const NOTE_TONE: Record<LeadNoteKind, string> = {
  MANUAL: "text-violet-600 dark:text-violet-400",
  STAGE_CHANGED: "text-sky-600 dark:text-sky-400",
  ENROLLMENT_CREATED: "text-emerald-600 dark:text-emerald-400",
  ENROLLMENT_UPDATED: "text-sky-600 dark:text-sky-400",
  ENROLLMENT_SUSPENDED: "text-amber-600 dark:text-amber-400",
  ENROLLMENT_REACTIVATED: "text-emerald-600 dark:text-emerald-400",
  ENROLLMENT_CANCELED: "text-red-600 dark:text-red-400",
  CLASS_SCHEDULED: "text-sky-600 dark:text-sky-400",
  CLASS_ATTENDED: "text-emerald-600 dark:text-emerald-400",
  CLASS_NO_SHOW: "text-red-600 dark:text-red-400",
  CLASS_RESCHEDULED: "text-amber-600 dark:text-amber-400",
  CLASS_CANCELED: "text-zinc-500",
  WHATSAPP_REPLY: "text-emerald-600 dark:text-emerald-400",
  FOLLOWUP_PAUSED: "text-zinc-500",
  FOLLOWUP_RESUMED: "text-sky-600 dark:text-sky-400",
  LEAD_CREATED: "text-zinc-500",
  LEAD_DELETED: "text-red-600 dark:text-red-400",
  LEAD_RESTORED: "text-emerald-600 dark:text-emerald-400",
  MANYCHAT_EVENT: "text-fuchsia-600 dark:text-fuchsia-400",
  PAYMENT_CONFIRMED: "text-emerald-600 dark:text-emerald-400",
};

function HistoryTab({ leadId }: { leadId: string }) {
  // refreshKey força remount da lista quando uma observação nova é
  // adicionada — sem setState-dentro-de-effect (anti-pattern do
  // react-hooks/set-state-in-effect).
  const [filter, setFilter] = useState<"all" | "manual">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const handleAdd = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addLeadNote({ leadId, body: trimmed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Observação salva");
      setRefreshKey((k) => k + 1);
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <Label htmlFor="new-note" className="text-xs font-medium">
          Nova observação
        </Label>
        <Textarea
          id="new-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="ex: ligou perguntando sobre horário noturno · gosto pelo professor X · …"
          disabled={pending}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={pending || body.trim().length === 0}
          >
            {pending ? "Salvando…" : "Adicionar"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Diário
        </h4>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-0.5 transition",
              filter === "all" ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setFilter("all")}
          >
            Tudo
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-0.5 transition",
              filter === "manual" ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setFilter("manual")}
          >
            Só observações
          </button>
        </div>
      </div>

      <NoteList key={`${leadId}:${filter}:${refreshKey}`} leadId={leadId} filter={filter} />
    </div>
  );
}

function NoteList({
  leadId,
  filter,
}: {
  leadId: string;
  filter: "all" | "manual";
}) {
  const [notes, setNotes] = useState<LeadNoteView[] | null>(null);

  useEffect(() => {
    let aborted = false;
    getLeadNotes(leadId, filter).then((data) => {
      if (!aborted) setNotes(data ?? []);
    });
    return () => {
      aborted = true;
    };
  }, [leadId, filter]);

  if (notes === null) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {filter === "manual"
          ? "Nenhuma observação manual registrada ainda."
          : "Sem registros no diário ainda."}
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {notes.map((n) => {
        const Icon = NOTE_ICON[n.kind] ?? Sparkles;
        const who = n.author?.name ?? n.author?.email ?? "sistema";
        return (
          <li
            key={n.id}
            className="flex gap-3 rounded border bg-card p-2.5"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", NOTE_TONE[n.kind])} />
            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-wrap text-sm">{n.body}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {who} · {format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Danger zone — soft delete do lead (v1.1-W)
// ──────────────────────────────────────────────────────────────────────────

function DangerZone({
  lead,
  onClose,
}: {
  lead: LeadDetails;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasActiveEnrollment = lead.enrollment?.status === "ACTIVE";

  return (
    <>
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
          Zona perigosa
        </h4>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Exclui o lead e move pra lixeira (ADMIN pode restaurar). Histórico
          preservado.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-8 border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
          onClick={() => setOpen(true)}
          disabled={hasActiveEnrollment}
          title={
            hasActiveEnrollment
              ? "Cancele a matrícula ativa antes de excluir"
              : undefined
          }
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Excluir lead
        </Button>
        {hasActiveEnrollment ? (
          <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-400">
            Lead tem matrícula ativa — cancele primeiro.
          </p>
        ) : null}
      </div>

      <DeleteLeadDialog
        open={open}
        onClose={() => setOpen(false)}
        leadId={lead.id}
        leadName={lead.name}
        onDeleted={onClose}
      />
    </>
  );
}

function DeleteLeadDialog({
  open,
  onClose,
  leadId,
  leadName,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  onDeleted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <DeleteLeadBody
            leadId={leadId}
            leadName={leadName}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteLeadBody({
  leadId,
  leadName,
  onClose,
  onDeleted,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo (mínimo 3 caracteres)");
      return;
    }
    startTransition(async () => {
      const result = await deleteLead({ leadId, reason: reason.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead excluído");
      onDeleted();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir lead</DialogTitle>
        <DialogDescription>
          Lead <span className="font-medium">{leadName}</span> some do kanban e
          vai pra lixeira. ADMIN pode restaurar depois. Informe o motivo (fica
          gravado no diário do lead).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">
          Motivo <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="delete-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex: lead duplicado (já existe Maria Silva mais novo); spam; teste interno…"
          rows={3}
          disabled={pending}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={pending || reason.trim().length < 3}
        >
          {pending ? "Excluindo…" : "Confirmar exclusão"}
        </Button>
      </DialogFooter>
    </>
  );
}
