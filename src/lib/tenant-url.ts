/**
 * Gera URLs de tenant trocando o subdomínio do host atual.
 *
 * Em dev:  host="localhost:3000" + slug="gracie" → "http://gracie.localhost:3000"
 * Em prod: host="app.simplifica.com.br" + slug="gracie" → "https://gracie.app.simplifica.com.br"
 *
 * Mantém a porta. O protocolo é inferido pelo header `x-forwarded-proto`
 * quando atrás de proxy (prod) e cai pra "http" em localhost.
 */
export function buildTenantUrl(params: {
  slug: string;
  host: string;
  forwardedProto?: string | null;
  path?: string;
}): string {
  const { slug, host, forwardedProto, path = "/dashboard" } = params;

  const hostname = host.split(":")[0]!;
  const port = host.includes(":") ? host.split(":")[1] : undefined;

  // Se já tem subdomínio (ex: "gracie.localhost"), troca o primeiro segmento.
  // Se é host raiz (ex: "localhost" ou "app.simplifica.com.br"), prefixa.
  const segments = hostname.split(".");
  const isRootHost =
    segments.length < 2 ||
    hostname === "localhost" ||
    hostname === "app.simplifica.com.br";

  const newHostname = isRootHost ? `${slug}.${hostname}` : [slug, ...segments.slice(1)].join(".");

  // Localhost com OU sem subdomínio: `localhost`, `gracie.localhost`, etc.
  // Sem essa checagem ampla, gerar link de outro tenant a partir de
  // `admin.localhost:3000` produziria `https://...` e quebraria em dev.
  const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
  const proto = forwardedProto ?? (isLocalhost ? "http" : "https");
  const portSuffix = port ? `:${port}` : "";

  return `${proto}://${newHostname}${portSuffix}${path}`;
}

/** Variante pro subdomínio admin. */
export function buildAdminUrl(params: {
  host: string;
  forwardedProto?: string | null;
  path?: string;
}): string {
  return buildTenantUrl({ ...params, slug: "admin", path: params.path ?? "/admin" });
}
