import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produz um bundle minimal em `.next/standalone` com node_modules
  // só do necessário — o Dockerfile copia isso e não precisa do `next` instalado
  // no runtime.
  output: "standalone",
};

export default nextConfig;
