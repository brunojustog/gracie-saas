import type { Metadata, Viewport } from "next";
import { Barlow, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { getCurrentTenant } from "@/server/tenant";

import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

// v1.2-O: fonte da marca (Barlow ≈ AdiHaus DIN). Mantém o nome da variável
// --font-geist-sans pra não mexer no globals.css / componentes.
const geistSans = Barlow({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Título da aba dinâmico (v1.1-AZ): usa o nome do tenant do domínio.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const name = tenant?.name ?? "Gracie Barra Anália Franco";
  return {
    title: name,
    description: "Gestão comercial para academias — Simplifica Online",
    applicationName: name,
    appleWebApp: { capable: true, statusBarStyle: "default", title: name },
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-180.png",
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const tenant = await getCurrentTenant();
  return { themeColor: tenant?.primaryColor ?? "#8B0000" };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
