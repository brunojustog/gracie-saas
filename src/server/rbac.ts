import type { Role } from "@prisma/client";

/**
 * Hierarquia de roles. Maior = mais permissivo.
 *   ADMIN > MANAGER > SELLER
 *
 * Pure (sem Prisma em runtime): pode ser importado de Server Components,
 * Server Actions, Route Handlers, e até Client Components (pra UI gating).
 */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  MANAGER: 2,
  SELLER: 1,
};

/** `roleAtLeast("MANAGER", "SELLER") === true` (manager pode tudo de seller). */
export function roleAtLeast(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}
