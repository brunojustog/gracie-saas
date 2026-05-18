"use client";

import { LeadOrigin } from "@prisma/client";
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { value: string; label: string };

const ORIGIN_OPTIONS: Array<{ value: LeadOrigin; label: string }> = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM_DIRECT", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Indicação" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "PHONE", label: "Telefone" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "MANYCHAT", label: "ManyChat" },
  { value: "LINK_BIO", label: "Link Bio" },
  { value: "PHONE_CALL", label: "Ligação" },
  { value: "HOSPITAL_PARTNERSHIP", label: "Parceria Hospital" },
  { value: "OTHER", label: "Outros" },
];

const ALL_VALUE = "__all__";

type Props = {
  modalities: Option[];
  sellers: Option[]; // vazio quando role=SELLER
  tags: string[];
  current: {
    origin?: string;
    modality?: string;
    seller?: string;
    tag?: string;
  };
};

export function DashboardFilters({ modalities, sellers, tags, current }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "" || value === ALL_VALUE) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`);
    });
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("origin");
    next.delete("modality");
    next.delete("seller");
    next.delete("tag");
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`);
    });
  };

  const activeCount = [current.origin, current.modality, current.seller, current.tag].filter(
    Boolean,
  ).length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <span className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
        Filtros
      </span>

      <Select
        value={current.origin ?? ALL_VALUE}
        onValueChange={(v) => setParam("origin", v)}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas as origens</SelectItem>
          {ORIGIN_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.modality ?? ALL_VALUE}
        onValueChange={(v) => setParam("modality", v)}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue placeholder="Modalidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas as modalidades</SelectItem>
          {modalities.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sellers.length > 0 ? (
        <Select
          value={current.seller ?? ALL_VALUE}
          onValueChange={(v) => setParam("seller", v)}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Vendedora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas as vendedoras</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {tags.length > 0 ? (
        <Select
          value={current.tag ?? ALL_VALUE}
          onValueChange={(v) => setParam("tag", v)}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todas as tags</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {activeCount > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={clearAll}
          className="h-8 px-2 text-xs"
        >
          <X className="mr-1 h-3 w-3" />
          Limpar ({activeCount})
        </Button>
      ) : null}
    </div>
  );
}
