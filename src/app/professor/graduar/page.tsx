import Link from "next/link";

import { getGraduationList } from "@/server/graduations";
import { roleAtLeast } from "@/server/rbac";
import { requireProfessor } from "@/server/tenant";

import { GraduarView } from "./graduar-view";

export default async function GraduarPage() {
  const { tenant, membership, professor } = await requireProfessor();
  const isAdmin = roleAtLeast(membership.role, "ADMIN");

  if (!professor && !isAdmin) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Graduação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário não está vinculado a um professor.
        </p>
      </main>
    );
  }

  const rows = await getGraduationList(tenant.id);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Graduação</div>
            <div className="text-xs text-muted-foreground">
              {tenant.name} · graduar alunos
            </div>
          </div>
          <Link
            href="/professor"
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            Minhas aulas
          </Link>
        </div>
      </header>

      <GraduarView rows={rows} />
    </div>
  );
}
