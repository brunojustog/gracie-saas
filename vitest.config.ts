import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Co-locação: testes ficam em `__tests__/` ao lado do código que cobrem.
    // Não usamos jsdom — todos os testes são pure functions / lógica server.
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
