/**
 * v1.2-O/AT: casca do app do professor. Tema ESCURO da marca (.dark → shadcn
 * vermelho GB) + topbar com logo e nav inferior, pra ficar com cara de
 * aplicativo no celular, consistente com o app do aluno. A gestão/admin segue
 * no tema claro (console).
 */
import Link from "next/link";

import { AppSplash } from "@/components/app-splash";
import { MoneyToggle } from "@/components/money-toggle";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import { getCurrentTenant } from "@/server/tenant";

import { ProfessorNav } from "./professor-nav";

export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getCurrentTenant();

  return (
    <div className="dark min-h-screen bg-background pb-16 text-foreground">
      <AppSplash />

      {/* Topbar do app — logo + tenant + sair */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-2.5">
          <Link href="/professor" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">GRACIE BARRA</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {tenant?.name ?? "Professor"} · Professor
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <MoneyToggle />
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
          </div>
        </div>
      </header>

      {children}

      <ProfessorNav />
    </div>
  );
}
