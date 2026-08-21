import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produz um bundle minimal em `.next/standalone` com node_modules
  // só do necessário — o Dockerfile copia isso e não precisa do `next` instalado
  // no runtime.
  output: "standalone",
  experimental: {
    // v1.2-M: uploads (foto do aluno, NF, foto de graduação) via Server Action
    // passam de 1 MB — o default do Next barra antes do nosso código. 12 MB
    // cobre a NF (limite 10 MB) + overhead. Cada action mantém seu próprio cap.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
