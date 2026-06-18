"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_BELTS, BELT_DEGREES } from "@/lib/belts";

const NO_BELT = "__none__";

/**
 * Seletor de graduação (faixa + grau). Controlado: `belt` é "" quando não
 * informado; `degree` é 0 por padrão. Reutilizado em novo-lead, ficha do
 * lead e edição de matrícula.
 */
export function BeltSelect({
  belt,
  degree,
  onBeltChange,
  onDegreeChange,
  disabled,
  idPrefix = "belt",
}: {
  belt: string;
  degree: number;
  onBeltChange: (b: string) => void;
  onDegreeChange: (d: number) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-belt`}>Graduação</Label>
        <Select
          value={belt === "" ? NO_BELT : belt}
          onValueChange={(v) => onBeltChange(v === NO_BELT ? "" : v)}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-belt`}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BELT}>—</SelectItem>
            {ALL_BELTS.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-degree`}>Grau</Label>
        <Select
          value={String(degree)}
          onValueChange={(v) => onDegreeChange(Number(v))}
          disabled={disabled || belt === ""}
        >
          <SelectTrigger id={`${idPrefix}-degree`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BELT_DEGREES.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d === 0 ? "Sem grau" : `${d}º grau`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
