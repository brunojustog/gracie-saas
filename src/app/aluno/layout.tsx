import { Barlow, Barlow_Semi_Condensed } from "next/font/google";

import { AppSplash } from "@/components/app-splash";

import "./aluno.css";

/**
 * v1.2-N: casca do app do aluno com a identidade Gracie Barra (manual da marca):
 * vermelho #E1251B, azul #11286D, neutros de concreto/grafite, e tipografia
 * DIN-humanista (Barlow / Barlow Semi Condensed — substituto livre da AdiHaus
 * DIN, que é proprietária). Escopado em .gb-aluno; a gestão segue o tema padrão.
 */
const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--gb-font",
  display: "swap",
});
const display = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--gb-display",
  display: "swap",
});

export default function AlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`gb-aluno ${body.variable} ${display.variable}`}>
      <AppSplash />
      {children}
    </div>
  );
}
