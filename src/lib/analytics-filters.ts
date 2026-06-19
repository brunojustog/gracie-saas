/**
 * Parser puro dos filtros da dashboard (v1.1-R; multi-seleção em v1.1-AX).
 * Recebe um objeto de searchParams (já resolvido) e devolve um
 * `DashboardFilters` normalizado. Cada filtro aceita múltiplos valores
 * separados por vírgula (ex.: `origin=WHATSAPP,INSTAGRAM_DIRECT`).
 * Validações defensivas — tudo opcional, valores desconhecidos descartados.
 *
 * Não tem dependência de Prisma — apenas tipos do client. Testável
 * em isolamento; o consumo real (queries) fica em analytics.ts.
 */
import { LeadOrigin } from "@prisma/client";

const ORIGIN_VALUES = new Set<string>(Object.values(LeadOrigin));

export type DashboardFilters = {
  origins?: LeadOrigin[];
  modalityIds?: string[];
  sellerIds?: string[];
  tags?: string[];
};

export type RawFilterParams = {
  origin?: string;
  modality?: string;
  seller?: string;
  tag?: string;
};

/** Quebra um CSV em valores limpos e únicos; vazio vira undefined. */
function csv(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  return parts.length > 0 ? parts : undefined;
}

export function parseDashboardFilters(raw: RawFilterParams): DashboardFilters {
  const out: DashboardFilters = {};

  const origins = csv(raw.origin)?.filter((o) => ORIGIN_VALUES.has(o));
  if (origins && origins.length > 0) out.origins = origins as LeadOrigin[];

  // IDs: aceita strings não-vazias, deixa Prisma validar existência depois.
  const modalityIds = csv(raw.modality);
  if (modalityIds) out.modalityIds = modalityIds;
  const sellerIds = csv(raw.seller);
  if (sellerIds) out.sellerIds = sellerIds;

  const tags = csv(raw.tag);
  if (tags) out.tags = tags;

  return out;
}

/** Conta quantos filtros estão ativos (pra badge "N filtros" na UI). */
export function activeFilterCount(filters: DashboardFilters): number {
  return Object.values(filters).filter(
    (v) => Array.isArray(v) && v.length > 0,
  ).length;
}
