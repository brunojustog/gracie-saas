/**
 * Helpers de tenant para Server Components, Server Actions e Route Handlers.
 *
 * NODE-ONLY: importa Prisma. Não use isto no `proxy.ts` (Edge).
 *
 * Convenção de uso:
 *   - `getCurrentTenant()` retorna o contexto cru (pode ser root/admin/tenant)
 *   - `requireTenantUser()` exige tenant + user logado + membership; redireciona
 *     se faltar qualquer um dos três
 *   - `requireRole(role)` exige role específico (preparação Fase 4 / RBAC)
 *   - `requireSuperAdmin()` exige `isSuperAdmin: true`
 *
 * Os requires SEMPRE redirecionam (nunca retornam null) — assim a tipagem do
 * caller é estreita e não precisa narrowing.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Role, Tenant, TenantUser, User } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/server/auth";
import { roleAtLeast } from "@/server/rbac";
import {
  TENANT_HEADER,
  type TenantContext,
  decodeTenantHeader,
} from "@/server/tenant-routing";

/** Lê o contexto setado pelo proxy. Cacheado por request via `react.cache`. */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const h = await headers();
  return decodeTenantHeader(h.get(TENANT_HEADER));
});

/**
 * Carrega o Tenant do banco quando o contexto é `kind: "tenant"`.
 * Retorna `null` para root/admin/slug inválido. Cacheado por request.
 */
export const getCurrentTenant = cache(async (): Promise<Tenant | null> => {
  const ctx = await getTenantContext();
  if (ctx.kind !== "tenant") return null;

  return prisma.tenant.findUnique({
    where: { slug: ctx.slug, active: true },
  });
});

export type TenantSession = {
  tenant: Tenant;
  user: User;
  membership: TenantUser;
};

/**
 * Garante que o request está num subdomínio de tenant válido E que o user
 * logado tem membership ativa. Caso contrário, redireciona:
 *   - sem auth → /login
 *   - sem tenant na URL → /tenants (picker)
 *   - tenant não encontrado/inativo → /tenants
 *   - user sem membership no tenant → /tenants
 *
 * Super-admins ganham um TenantUser sintético com role ADMIN se não tiverem
 * membership explícita no tenant.
 */
/**
 * Resolve tenant + user + membership. NÃO aplica o gating de PROFESSOR — é a
 * base compartilhada por `requireTenantUser` (que redireciona professor pra
 * /professor) e `requireProfessor` (que precisa justamente do professor).
 */
async function resolveTenantSession(): Promise<TenantSession> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await getTenantContext();
  if (ctx.kind === "root") redirect("/tenants");
  if (ctx.kind === "admin") redirect("/admin");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: ctx.slug, active: true },
  });
  if (!tenant) redirect("/tenants");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) redirect("/login");

  let membership = await prisma.tenantUser.findUnique({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: user.id },
      // FYI: `active: true` não é parte da unique key; filtra abaixo
    },
  });

  if (membership && !membership.active) membership = null;

  // Super-admin tem acesso a qualquer tenant. Materializa membership virtual
  // pra simplificar callers (sempre recebem `membership` definido).
  if (!membership && user.isSuperAdmin) {
    membership = {
      id: `super-admin:${tenant.id}`,
      tenantId: tenant.id,
      userId: user.id,
      role: "ADMIN",
      active: true,
      createdAt: new Date(),
    };
  }

  if (!membership) redirect("/tenants");

  return { tenant, user, membership };
}

/**
 * Exige tenant + user + membership ativa. v1.1-CB: professor é redirecionado
 * pra sua tela dedicada (/professor) — não acessa nenhuma tela de gestão.
 */
export async function requireTenantUser(): Promise<TenantSession> {
  const session = await resolveTenantSession();
  if (session.membership.role === "PROFESSOR") redirect("/professor");
  if (session.membership.role === "ALUNO") redirect("/aluno");
  return session;
}

/**
 * v1.1-CB: acesso à tela do professor. Permite PROFESSOR (loga e vê só as
 * aulas dele) e ADMIN (Anderson é supervisor + professor). Carrega o Professor
 * vinculado ao usuário logado (pode ser null pra um admin sem vínculo).
 */
export async function requireProfessor(): Promise<
  TenantSession & { professor: { id: string; name: string } | null }
> {
  const session = await resolveTenantSession();
  const { membership, tenant, user } = session;
  const isProfessorRole = membership.role === "PROFESSOR";
  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  if (!isProfessorRole && !isAdmin) redirect("/dashboard");

  const professor = await prisma.professor.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true, name: true },
  });
  return { ...session, professor };
}

/**
 * v1.2-A: acesso à tela do aluno. Permite ALUNO (loga e vê só a tela dele) e
 * ADMIN (pra suporte/teste). Carrega o Aluno vinculado ao usuário logado
 * (null pra um admin sem vínculo). Nome vem do Lead (1:1).
 */
export async function requireAluno(): Promise<
  TenantSession & {
    aluno: { id: string; name: string; matricula: string | null } | null;
  }
> {
  const session = await resolveTenantSession();
  const { membership, tenant, user } = session;
  const isAlunoRole = membership.role === "ALUNO";
  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  if (!isAlunoRole && !isAdmin) redirect("/dashboard");

  const aluno = await prisma.aluno.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true, matricula: true, lead: { select: { name: true } } },
  });
  return {
    ...session,
    aluno: aluno
      ? { id: aluno.id, name: aluno.lead.name, matricula: aluno.matricula }
      : null,
  };
}

/**
 * Exige role >= minRole. Hierarquia em `rbac.ts`.
 * Quem não atender, volta pro /dashboard (não 403 — é UI, não API).
 */
export async function requireRole(minRole: Role): Promise<TenantSession> {
  const session = await requireTenantUser();
  if (!roleAtLeast(session.membership.role, minRole)) {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Para rotas em `admin.*` (escopo agregado de super-admin). Retorna o User
 * e exige `isSuperAdmin: true`.
 */
export async function requireSuperAdmin(): Promise<{ user: User }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user?.isSuperAdmin) redirect("/tenants");

  return { user };
}
