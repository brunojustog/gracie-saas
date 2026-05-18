/**
 * Parser puro dos filtros da dashboard (v1.1-R). Recebe um objeto
 * de searchParams (já resolvido) e devolve um `DashboardFilters`
 * normalizado. Validações defensivas — tudo opcional, valores
 * desconhecidos viram `undefined`.
 *
 * Não tem dependência de Prisma — apenas tipos do client. Testável
 * em isolamento; o consumo real (queries) fica em analytics.ts.
 */
import { LeadOrigin } from "@prisma/client";

const ORIGIN_VALUES = new Set<string>(Object.values(LeadOrigin));

export type DashboardFilters = {
  origin?: LeadOrigin;
  modalityId?: string;
  sellerId?: string;
  tag?: string;
};

export type RawFilterParams = {
  origin?: string;
  modality?: string;
  seller?: string;
  tag?: string;
};

export function parseDashboardFilters(raw: RawFilterParams): DashboardFilters {
  const out: DashboardFilters = {};

  if (raw.origin && ORIGIN_VALUES.has(raw.origin)) {
    out.origin = raw.origin as LeadOrigin;
  }

  // IDs: aceita string não-vazia, deixa Prisma validar existência depois.
  if (raw.modality?.trim()) out.modalityId = raw.modality.trim();
  if (raw.seller?.trim()) out.sellerId = raw.seller.trim();

  if (raw.tag?.trim()) out.tag = raw.tag.trim();

  return out;
}

/** Conta quantos filtros estão ativos (pra badge "N filtros" na UI). */
export function activeFilterCount(filters: DashboardFilters): number {
  return Object.values(filters).filter((v) => v !== undefined && v !== "").length;
}
