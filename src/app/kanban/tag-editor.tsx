"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Tags pré-definidas do playbook GB Anália Franco.
 * Vendedoras podem criar tags custom via input livre, mas começam com
 * essas como sugestões clicáveis pra evitar inconsistência ("Contatado"
 * vs "contatado" vs "Contactado").
 */
export const SUGGESTED_TAGS = [
  "Contatado",
  "Confirmado",
  "Remarcou",
  "VISITANTE GB",
  "AVULSO",
  "Aluno Perdido",
  "Não Fechou",
] as const;

const TAG_STYLES: Record<string, string> = {
  "Contatado":      "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  "Confirmado":     "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
  "Remarcou":       "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  "VISITANTE GB":   "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200",
  "AVULSO":         "bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-200",
  "Aluno Perdido":  "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  "Não Fechou":     "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
};
const DEFAULT_TAG_STYLE = "bg-gray-100 text-gray-900 dark:bg-gray-900/40 dark:text-gray-200";

/** Pill renderer reutilizado em LeadCard, LeadSheet e filtros. */
export function TagPill({
  tag,
  onRemove,
  size = "default",
}: {
  tag: string;
  onRemove?: () => void;
  size?: "default" | "sm";
}) {
  const style = TAG_STYLES[tag] ?? DEFAULT_TAG_STYLE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        style,
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
    >
      {tag}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 hover:bg-black/10"
          aria-label={`Remover ${tag}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      ) : null}
    </span>
  );
}

/** Editor full: chips das tags atuais + sugestões clicáveis + input pra custom. */
export function TagEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [customInput, setCustomInput] = useState("");

  const toggle = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  const handleAddCustom = () => {
    const t = customInput.trim();
    if (!t || value.includes(t)) {
      setCustomInput("");
      return;
    }
    onChange([...value, t]);
    setCustomInput("");
  };

  const unusedSuggestions = SUGGESTED_TAGS.filter((s) => !value.includes(s));

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              onRemove={disabled ? undefined : () => toggle(tag)}
            />
          ))}
        </div>
      ) : null}

      {unusedSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {unusedSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              disabled={disabled}
              className={cn(
                "rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors",
                "hover:border-solid hover:bg-accent hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              + {tag}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddCustom();
            }
          }}
          placeholder="Tag custom (Enter pra adicionar)…"
          className="h-8 text-xs"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddCustom}
          disabled={disabled || !customInput.trim()}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}
