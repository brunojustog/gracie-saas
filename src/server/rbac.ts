import type { Role } from "@prisma/client";

/**
 * Hierarquia de roles administrativos. Maior = mais permissivo.
 *   ADMIN > MANAGER > SELLER
 *
 * PROFESSOR (v1.1-CB) e ALUNO (v1.2-A) NÃO fazem parte dessa hierarquia — são
 * trilhas separadas (professor só vê a confirmação de aulas; aluno só a tela
 * dele). rank 0 = nunca satisfaz um requireRole administrativo, então ambos são
 * redirecionados pra fora das telas de gestão.
 *
 * Pure (sem Prisma em runtime): pode ser importado de Server Components,
 * Server Actions, Route Handlers, e até Client Components (pra UI gating).
 */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 3,
  MANAGER: 2,
  SELLER: 1,
  PROFESSOR: 0,
  ALUNO: 0,
};

/** `roleAtLeast("MANAGER", "SELLER") === true` (manager pode tudo de seller). */
export function roleAtLeast(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}
