"use client";

import {
  Calendar,
  GraduationCap,
  Kanban,
  LayoutDashboard,
  Settings,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: typeof Kanban;
  adminOnly?: boolean;
};

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: Kanban },
  { href: "/aulas", label: "Aulas", icon: Calendar },
  { href: "/matriculas", label: "Matrículas", icon: GraduationCap },
  { href: "/pdv", label: "Lojinha", icon: ShoppingBag },
  // v1.1-AH: Config visível pra todos — SELLER acessa /settings/planos
  // (a nav lateral do settings filtra o resto por role).
  { href: "/settings", label: "Config", icon: Settings },
];

export type TopNavProps = {
  tenantName: string;
  tenantColor?: string | null;
  userEmail: string;
  role: "ADMIN" | "MANAGER" | "SELLER";
  /** Render prop pra botao "Sair" — Server Action precisa estar definida no caller. */
  signOutSlot: React.ReactNode;
};

/**
 * Cabeçalho global. Rendado em cada page que quiser nav consistente
 * (kanban, aulas, matriculas, pdv, dashboard). `usePathname` destaca o
 * link da rota atual.
 *
 * Sticky no topo da viewport pra ficar acessível mesmo durante scroll
 * longo de listas/kanban.
 */
export function TopNav({
  tenantName,
  tenantColor,
  userEmail,
  role,
  signOutSlot,
}: TopNavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            className="h-7 w-7 rounded-md"
            style={{ background: tenantColor ?? "#6B7280" }}
            aria-hidden
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold">{tenantName}</div>
            <div className="text-[10px] text-muted-foreground">
              {role.toLowerCase()}
            </div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
          {LINKS.filter((l) => !l.adminOnly || role === "ADMIN").map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("h-8 gap-1.5", active && "shadow-sm")}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline">
            {userEmail}
          </span>
          {signOutSlot}
        </div>
      </div>
    </header>
  );
}
