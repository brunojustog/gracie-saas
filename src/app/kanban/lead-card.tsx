"use client";

import { differenceInCalendarDays } from "date-fns";
import {
  Camera,
  Footprints,
  Globe,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Phone,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { LeadOrigin } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    origin: LeadOrigin;
    lastInteractionAt: Date | string;
    modality: { id: string; name: string } | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
  };
  /** Quando renderizado dentro do <DragOverlay/> do dnd-kit; tira sombras/handles. */
  isOverlay?: boolean;
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
  OTHER: MessageSquare,
};

const ORIGIN_LABEL: Record<LeadOrigin, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM_DIRECT: "Instagram",
  FACEBOOK: "Facebook",
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  WALK_IN: "Fachada",
  PHONE: "Telefone",
  GOOGLE_ADS: "Google Ads",
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

export function LeadCard({ lead, isOverlay = false }: Props) {
  const Icon = ORIGIN_ICON[lead.origin];
  const lastDate = new Date(lead.lastInteractionAt);
  const stale = staleness(lastDate);
  const phone = maskPhone(lead.phone);
  const sellerName = lead.assignedSeller?.name ?? lead.assignedSeller?.email;

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
          </div>
        </div>
      </div>
    </Card>
  );
}
