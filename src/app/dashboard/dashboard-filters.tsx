"use client";

import { LeadOrigin } from "@prisma/client";
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { MultiSelectPopover } from "@/components/multi-select-popover";

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

type Props = {
  modalities: Option[];
  sellers: Option[]; // vazio quando role=SELLER
  tags: string[];
  current: {
    origins: string[];
    modalities: string[];
    sellers: string[];
    tags: string[];
  };
};

export function DashboardFilters({ modalities, sellers, tags, current }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params.toString());
    if (values.length > 0) next.set(key, values.join(","));
    else next.delete(key);
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

  const activeCount =
    (current.origins.length > 0 ? 1 : 0) +
    (current.modalities.length > 0 ? 1 : 0) +
    (current.sellers.length > 0 ? 1 : 0) +
    (current.tags.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <span className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
        Filtros
      </span>

      <MultiSelectPopover
        options={ORIGIN_OPTIONS}
        selected={current.origins}
        onChange={(v) => setMulti("origin", v)}
        allLabel="Todas as origens"
        width="w-[150px]"
        triggerClassName="h-8 text-xs"
      />

      <MultiSelectPopover
        options={modalities}
        selected={current.modalities}
        onChange={(v) => setMulti("modality", v)}
        allLabel="Todas as modalidades"
        width="w-[150px]"
        triggerClassName="h-8 text-xs"
      />

      {sellers.length > 0 ? (
        <MultiSelectPopover
          options={sellers}
          selected={current.sellers}
          onChange={(v) => setMulti("seller", v)}
          allLabel="Todas as vendedoras"
          width="w-[150px]"
          triggerClassName="h-8 text-xs"
        />
      ) : null}

      {tags.length > 0 ? (
        <MultiSelectPopover
          options={tags.map((t) => ({ value: t, label: t }))}
          selected={current.tags}
          onChange={(v) => setMulti("tag", v)}
          allLabel="Todas as tags"
          width="w-[150px]"
          triggerClassName="h-8 text-xs"
        />
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
