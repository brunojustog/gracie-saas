"use client";

import { differenceInCalendarDays } from "date-fns";
import {
  AlertTriangle,
  Camera,
  CheckCheck,
  ExternalLink,
  Footprints,
  Globe,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Pause,
  Phone,
  Send,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { LeadOrigin } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { TagPill } from "./tag-editor";

/**
 * Snapshot mínimo do follow-up que o card precisa pra desenhar o badge.
 * Mantido aqui (e não importado de @/server/messaging/status) pra evitar
 * que o bundle do client puxe módulos server-side.
 */
export type LeadCardFollowUp = {
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
};

type Props = {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    origin: LeadOrigin;
    lastInteractionAt: Date | string;
    chatwootConversationId: string | null;
    modality: { id: string; name: string } | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
    tags?: string[];
    followUp?: LeadCardFollowUp | null;
  };
  /** Quando renderizado dentro do <DragOverlay/> do dnd-kit; tira sombras/handles. */
  isOverlay?: boolean;
  /**
   * URL base do Chatwoot já com `/app/accounts/<id>/conversations/` no final
   * (basta concatenar `conversationId`). Null = tenant não tem Chatwoot
   * configurado → ícone não aparece.
   */
  chatwootConversationBaseUrl?: string | null;
};

// lucide-react v1 não exporta logos de marca (Facebook/Instagram saíram).
// Usamos ícones semânticos genéricos — o label textual já distingue o canal.
const ORIGIN_ICON: Record<LeadOrigin, LucideIcon> = {
  WHATSAPP: MessageCircle,
  INSTAGRAM_DIRECT: Camera,
  FACEBOOK: Users,
  WEBSITE: Globe,
  REFERRAL: UserPlus,
  WALK_IN: Footprints,
  PHONE: Phone,
  GOOGLE_ADS: Megaphone,
  // ── v1.1 ──
  MANYCHAT: MessageSquare,
  LINK_BIO: Globe,
  PHONE_CALL: Phone,
  HOSPITAL_PARTNERSHIP: UserPlus,
  OTHER: MessageSquare,
};

export const ORIGIN_LABEL: Record<LeadOrigin, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM_DIRECT: "Instagram",
  FACEBOOK: "Facebook",
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  WALK_IN: "Rua",
  PHONE: "Telefone",
  GOOGLE_ADS: "Google Ads",
  // ── v1.1 ──
  MANYCHAT: "Manychat",
  LINK_BIO: "Link da bio",
  PHONE_CALL: "Ligação",
  HOSPITAL_PARTNERSHIP: "Hospital",
  OTHER: "Outro",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Máscara simples pt-BR. Aceita +55 11 9... → (11) 9xxxx-xxxx. */
function maskPhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length !== 11 && digits.length !== 10) return raw;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function staleness(lastInteraction: Date): "fresh" | "warming" | "cold" {
  const days = differenceInCalendarDays(new Date(), lastInteraction);
  if (days >= 5) return "cold";
  if (days >= 2) return "warming";
  return "fresh";
}

const STALENESS_DOT: Record<ReturnType<typeof staleness>, string> = {
  fresh: "bg-emerald-500",
  warming: "bg-amber-500",
  cold: "bg-red-500",
};

const STALENESS_LABEL: Record<ReturnType<typeof staleness>, string> = {
  fresh: "Interação recente",
  warming: "Sem interação há 2-4 dias",
  cold: "Frio — sem interação há 5+ dias",
};

type FollowUpBadgeView = {
  icon: LucideIcon;
  label: string;
  title: string;
  className: string;
};

function buildFollowUpBadge(fu: LeadCardFollowUp): FollowUpBadgeView | null {
  switch (fu.summary) {
    case "idle":
      // Sem cadência enfileirada — não polui o card.
      return null;
    case "running":
      return {
        icon: Send,
        label: fu.currentStep ? `M${fu.currentStep}/${fu.totalSteps}` : "Em andamento",
        title: fu.currentStep
          ? `Follow-up em andamento — próxima mensagem: M${fu.currentStep} de ${fu.totalSteps}`
          : "Follow-up em andamento",
        className:
          "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200",
      };
    case "paused":
      return {
        icon: Pause,
        label: "Pausado",
        title: "Follow-up automático desligado pra esse lead",
        className:
          "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300",
      };
    case "tenantOff":
      return {
        icon: Pause,
        label: "Tenant off",
        title: "Follow-up global da academia está desligado em Settings → WhatsApp",
        className:
          "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300",
      };
    case "completed":
      return {
        icon: CheckCheck,
        label: "Concluído",
        title: "Cadência completa: M1..M8 enviadas sem resposta",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
      };
    case "responded":
      return {
        icon: CheckCheck,
        label: "Respondeu",
        title: "Lead respondeu — follow-up pausado automaticamente",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
      };
    case "failed":
      return {
        icon: AlertTriangle,
        label: "Falhou",
        title: "Última mensagem falhou no envio — confira a aba Follow-up",
        className:
          "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200",
      };
  }
}

export function LeadCard({
  lead,
  isOverlay = false,
  chatwootConversationBaseUrl,
}: Props) {
  const Icon = ORIGIN_ICON[lead.origin];
  const lastDate = new Date(lead.lastInteractionAt);
  const stale = staleness(lastDate);
  const phone = maskPhone(lead.phone);
  const sellerName = lead.assignedSeller?.name ?? lead.assignedSeller?.email;
  const followUpBadge = lead.followUp ? buildFollowUpBadge(lead.followUp) : null;
  const chatwootHref =
    chatwootConversationBaseUrl && lead.chatwootConversationId
      ? `${chatwootConversationBaseUrl}${lead.chatwootConversationId}`
      : null;

  return (
    <Card
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing transition-shadow",
        isOverlay ? "shadow-xl ring-2 ring-primary/30 rotate-1" : "shadow-sm hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(lead.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn("h-2 w-2 rounded-full", STALENESS_DOT[stale])}
              title={STALENESS_LABEL[stale]}
              aria-label={STALENESS_LABEL[stale]}
            />
            <h3 className="truncate text-sm font-medium">{lead.name}</h3>
            {chatwootHref ? (
              <a
                href={chatwootHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversa no Chatwoot"
                aria-label="Abrir conversa no Chatwoot"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          {phone ? (
            <p className="truncate text-xs text-muted-foreground">{phone}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px] font-normal">
              <Icon className="h-3 w-3" />
              {ORIGIN_LABEL[lead.origin]}
            </Badge>
            {lead.modality ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                {lead.modality.name}
              </Badge>
            ) : null}
            {sellerName ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                {sellerName}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-dashed px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              >
                sem vendedora
              </Badge>
            )}
            {followUpBadge ? (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 px-1.5 py-0 text-[10px] font-normal",
                  followUpBadge.className,
                )}
                title={followUpBadge.title}
                aria-label={followUpBadge.title}
              >
                <followUpBadge.icon className="h-3 w-3" />
                {followUpBadge.label}
              </Badge>
            ) : null}
          </div>
          {lead.tags && lead.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-0.5">
              {lead.tags.slice(0, 3).map((tag) => (
                <TagPill key={tag} tag={tag} size="sm" />
              ))}
              {lead.tags.length > 3 ? (
                <span className="text-[10px] text-muted-foreground">
                  +{lead.tags.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
