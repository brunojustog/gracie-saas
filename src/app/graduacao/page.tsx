import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getExamSchedule, EXAM_WINDOW } from "@/server/graduation-exams";
import { nextGraduation } from "@/server/graduations";
import { prisma } from "@/lib/prisma";
import { requireTenantUser } from "@/server/tenant";

import { GraduacaoView } from "./graduacao-view";

export default async function GraduacaoPage() {
  const { tenant, user, membership } = await requireTenantUser();

  const [schedule, alunoRows] = await Promise.all([
    getExamSchedule(tenant.id),
    prisma.aluno.findMany({
      where: { tenantId: tenant.id, active: true },
      select: {
        id: true,
        matricula: true,
        beltSize: true,
        lead: { select: { name: true, belt: true, beltDegree: true } },
      },
    }),
  ]);

  const alunos = alunoRows
    .map((a) => {
      const next = nextGraduation(a.lead.belt, a.lead.beltDegree);
      return {
        id: a.id,
        nome: a.lead.name,
        matricula: a.matricula,
        belt: a.lead.belt,
        beltDegree: a.lead.beltDegree,
        beltSize: a.beltSize,
        nextBelt: next?.belt ?? null,
        nextBeltDegree: next?.beltDegree ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <>
      <TopNav
        tenantName={tenant.name}
        tenantColor={tenant.primaryColor}
        userEmail={user.email}
        role={membership.role}
        signOutSlot={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Sair
            </Button>
          </form>
        }
      />
      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Graduação · Agendamento de provas</h1>
          <p className="text-sm text-muted-foreground">
            Marque a prova de graduação do aluno num horário fixo. Cada horário
            recebe uma prova; os professores veem tudo no app deles.
          </p>
        </div>
        <GraduacaoView schedule={schedule} alunos={alunos} window={EXAM_WINDOW} />
      </main>
    </>
  );
}
