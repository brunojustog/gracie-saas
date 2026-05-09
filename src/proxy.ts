// Next.js 16 renomeou `middleware.ts` → `proxy.ts`. Mesma assinatura,
// mesmo runtime Edge. Auth.js v5 ainda exporta `auth` como handler
// universal — funciona como proxy default export.
//
// IMPORTANTE: este arquivo é Edge-only. Importe APENAS de
// `auth.config.ts`, nunca de `auth.ts` (Prisma + bcrypt quebrariam Edge).
import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
