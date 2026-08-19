import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { getCurrentTenant } from "@/server/tenant";

import "./globals.css";
import { ServiceWorkerRegister } from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      icon: "/api/pwa-icon?s=192",
      apple: "/api/pwa-icon?s=180",
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
