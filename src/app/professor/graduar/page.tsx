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
    <div>
      <div className="mx-auto max-w-2xl px-4 pt-3">
        <h1 className="text-sm font-semibold">Graduação · graduar alunos</h1>
      </div>
      <GraduarView rows={rows} />
    </div>
  );
}
