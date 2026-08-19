/**
 * v1.2-D (PWA): manifest do app do aluno. Next injeta automaticamente
 * <link rel="manifest">. Nome/cor vêm do tenant do domínio. start_url = /aluno
 * (o aluno abre direto na tela dele).
 */
import type { MetadataRoute } from "next";

import { getCurrentTenant } from "@/server/tenant";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenant = await getCurrentTenant();
  const name = tenant?.name ?? "Gracie Barra";
  const theme = tenant?.primaryColor ?? "#8B0000";
  return {
    name,
    short_name: name.length > 12 ? "GB" : name,
    description: "App do aluno — check-in, graduação e cronograma da semana.",
    start_url: "/aluno",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: theme,
    icons: [
      { src: "/api/pwa-icon?s=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon?s=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/pwa-icon?s=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
