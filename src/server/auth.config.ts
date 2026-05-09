import type { NextAuthConfig } from "next-auth";

/**
 * Config Edge-safe do Auth.js v5.
 * NÃO importa Prisma, bcrypt ou qualquer adapter aqui — esse arquivo é
 * carregado pelo `proxy.ts` (antes Edge middleware) e qualquer dependência
 * Node-only quebra o build da Edge.
 *
 * O arquivo `auth.ts` (Node) estende este config adicionando o Credentials
 * provider e o PrismaAdapter.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ auth, request }) => {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/invite/");

      if (isPublic) return true;
      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
