// Next.js 16 renomeou `middleware.ts` → `proxy.ts`. Mesma assinatura,
// mesmo runtime Edge.
//
// IMPORTANTE: este arquivo é Edge-only. Importe APENAS de:
//   - auth.config.ts (Edge-safe, sem Prisma/bcrypt)
//   - tenant-routing.ts (puro, sem Node)
//
// Pipeline:
//   1. Auth.js valida sessão via callback `authorized` (em auth.config.ts).
//      Se não autenticado em rota privada → redirect pra /login.
//   2. Se autenticado, este wrapper extrai o tenant do `host` e propaga
//      via header `x-tenant-slug` para Server Components/Actions lerem.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/server/auth.config";
import {
  TENANT_HEADER,
  encodeTenantHeader,
  parseTenantFromHost,
} from "@/server/tenant-routing";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const host = req.headers.get("host");
  const tenant = parseTenantFromHost(host);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(TENANT_HEADER, encodeTenantHeader(tenant));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
