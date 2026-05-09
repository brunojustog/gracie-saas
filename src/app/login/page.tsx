import { Suspense } from "react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            GB
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Gracie SaaS</h1>
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
