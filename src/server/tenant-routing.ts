/**
 * Resolução de tenant a partir do `Host` da request.
 *
 * EDGE-SAFE: este módulo é importado pelo `proxy.ts` (runtime Edge).
 * NÃO importe Prisma, bcrypt, fs ou qualquer dependência Node-only.
 *
 * Estratégia: subdomínios em todos os ambientes.
 *   - dev:  `gracie.localhost:3000`, `admin.localhost:3000`
 *   - prod: `gracie.app.simplifica.com.br`, `admin.app.simplifica.com.br`
 *
 * `*.localhost` é RFC 6761 e resolvido automaticamente para 127.0.0.1
 * por Chrome/Firefox/Safari sem `/etc/hosts`. O mesmo código de extração
 * roda em dev e em prod.
 */

export const TENANT_HEADER = "x-tenant-slug";
export const ADMIN_SLUG = "__admin__";

/** Hostnames que NÃO carregam tenant (raiz da plataforma). */
const ROOT_HOSTS = new Set([
  "localhost",
  "app.simplifica.com.br",
  "simplificaonline.site",
]);

/** Subdomínios reservados para super-admin (escopo agregado). */
const ADMIN_SUBDOMAINS = new Set(["admin"]);

export type TenantContext =
  | { kind: "tenant"; slug: string }
  | { kind: "admin" }
  | { kind: "root" };

/**
 * Extrai o contexto de tenant a partir do header `Host`.
 *
 * @example
 *   parseTenantFromHost("gracie.localhost:3000")     // { kind: "tenant", slug: "gracie" }
 *   parseTenantFromHost("admin.localhost:3000")      // { kind: "admin" }
 *   parseTenantFromHost("localhost:3000")            // { kind: "root" }
 *   parseTenantFromHost("app.simplifica.com.br")     // { kind: "root" }
 *   parseTenantFromHost("gracie.app.simplifica.com.br") // { kind: "tenant", slug: "gracie" }
 */
export function parseTenantFromHost(host: string | null | undefined): TenantContext {
  if (!host) return { kind: "root" };

  // Strip port (e.g. "gracie.localhost:3000" → "gracie.localhost")
  const hostname = host.split(":")[0]!.toLowerCase();

  if (ROOT_HOSTS.has(hostname)) return { kind: "root" };

  // Pega o primeiro segmento como subdomínio. Para `gracie.localhost` → "gracie".
  // Para `gracie.app.simplifica.com.br` → "gracie" (assumindo que o domínio
  // base é `app.simplifica.com.br`).
  const segments = hostname.split(".");
  if (segments.length < 2) return { kind: "root" };

  const subdomain = segments[0]!;

  if (ADMIN_SUBDOMAINS.has(subdomain)) return { kind: "admin" };

  // Validação básica do slug: a-z, 0-9, hífen. Slugs inválidos viram root.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { kind: "root" };
  }

  return { kind: "tenant", slug: subdomain };
}

/** Encoda o contexto pra um header propagável (proxy → Server Component). */
export function encodeTenantHeader(ctx: TenantContext): string {
  if (ctx.kind === "tenant") return ctx.slug;
  if (ctx.kind === "admin") return ADMIN_SLUG;
  return "";
}

/** Decoda o header `x-tenant-slug` lido em Server Components. */
export function decodeTenantHeader(value: string | null | undefined): TenantContext {
  if (!value) return { kind: "root" };
  if (value === ADMIN_SLUG) return { kind: "admin" };
  return { kind: "tenant", slug: value };
}
