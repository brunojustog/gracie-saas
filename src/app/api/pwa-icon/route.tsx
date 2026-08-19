/**
 * v1.2-D (PWA): ícone do app gerado on-the-fly (evita precisar de PNGs no repo).
 * Fundo vermelho GB + "GB". Tamanho via ?s= (default 512). Público.
 */
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const s = Math.min(
    1024,
    Math.max(48, Number(new URL(req.url).searchParams.get("s") ?? "512") || 512),
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8B0000",
          color: "#ffffff",
          fontSize: Math.round(s * 0.42),
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: -2,
        }}
      >
        GB
      </div>
    ),
    { width: s, height: s },
  );
}
