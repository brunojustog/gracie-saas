"use client";

import {
  BarChart3,
  Calendar,
  Dumbbell,
  GraduationCap,
  Kanban,
  LayoutDashboard,
  Menu,
  Settings,
  ShoppingBag,
  Ticket,
  UserPlus,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: typeof Kanban;
  adminOnly?: boolean;
  exact?: boolean;
};

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: Kanban },
  { href: "/aulas", label: "Aulas", icon: Calendar },
  // v1.2-R: atalho fácil pro cadastro de aluno (era enterrado em Config).
  { href: "/settings/alunos", label: "Alunos", icon: UserPlus, adminOnly: true, exact: true },
  { href: "/matriculas", label: "Matrículas", icon: GraduationCap },
  { href: "/particulares", label: "Particulares", icon: Ticket },
  { href: "/avulsas", label: "Aulas avulsas", icon: ShoppingBag },
  { href: "/quadro", label: "Quadro do Vitor", icon: BarChart3, adminOnly: true },
  { href: "/professores", label: "Professores", icon: Dumbbell, adminOnly: true },
  { href: "/settings", label: "Config", icon: Settings, exact: true },
];

export type TopNavProps = {
  tenantName: string;
  tenantColor?: string | null;
  userEmail: string;
  role: Role;
  /** Render prop pra botao "Sair" — Server Action precisa estar definida no caller. */
  signOutSlot: React.ReactNode;
};

/**
 * v1.2-R: navegação da gestão como MENU LATERAL. Fixo à esquerda no desktop
 * (lg+), gaveta (drawer) no celular. Empurra o conteúdo via `body.has-sidebar`
 * — escopado nas telas de gestão (aluno/professor têm layout próprio).
 */
export function TopNav({
  tenantName,
  tenantColor,
  userEmail,
  role,
  signOutSlot,
}: TopNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("has-sidebar");
    return () => document.body.classList.remove("has-sidebar");
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = LINKS.filter((l) => !l.adminOnly || role === "ADMIN");

  const Brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span
        className="h-8 w-8 shrink-0 rounded-md bg-cover"
        style={{ backgroundColor: tenantColor ?? "#6B7280", backgroundImage: "url(/icon-192.png)", backgroundSize: "cover" }}
        aria-hidden
      />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{tenantName}</div>
        <div className="text-[10px] text-muted-foreground">{role.toLowerCase()}</div>
      </div>
    </Link>
  );

  const NavList = (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Topo mobile (com hambúrguer) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {Brand}
        {signOutSlot}
      </header>

      {/* Sidebar fixa (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="border-b px-4 py-3">{Brand}</div>
        <div className="flex-1 overflow-y-auto p-2">{NavList}</div>
        <div className="border-t p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground">{userEmail}</div>
          {signOutSlot}
        </div>
      </aside>

      {/* Drawer (mobile) */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3">
              {Brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{NavList}</div>
            <div className="border-t p-3">
              <div className="mb-2 truncate text-xs text-muted-foreground">{userEmail}</div>
              {signOutSlot}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
