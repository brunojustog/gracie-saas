import { Suspense } from "react";

import { getCurrentTenant } from "@/server/tenant";

import { LoginForm } from "./login-form";

/** Iniciais pro logo (2 primeiras palavras). Fallback "GB" (Gracie Barra). */
function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");
  return parts.join("") || "GB";
}

export default async function LoginPage() {
  // Multi-tenant: o nome vem do tenant resolvido pelo domínio (v1.1-AZ).
  // Em app.gbanaliafranco.com.br → "Gracie Barra Anália Franco".
  const tenant = await getCurrentTenant();
  const name = tenant?.name ?? "Gracie Barra Anália Franco";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            {initials(name)}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre com seu email e senha
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
