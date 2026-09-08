"use client";

import { Award, CalendarCheck, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * v1.2-AT: nav inferior do app do professor (estilo aplicativo, como o do
 * aluno). Fica fixa no rodapé; destaca a aba atual.
 */
const ITEMS = [
  { href: "/professor", label: "Início", icon: Home, exact: true },
  { href: "/professor/chamada", label: "Chamada", icon: CalendarCheck },
  { href: "/professor/graduar", label: "Graduar", icon: Award },
];

export function ProfessorNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {ITEMS.map((it) => {
          const active = it.exact
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(`${it.href}/`);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
