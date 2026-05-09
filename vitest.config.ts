import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Espelha o `paths` do tsconfig.json — sem isso, qualquer teste que
      // toque um módulo que importe @/lib/* ou @/server/* quebra.
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
