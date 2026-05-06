import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: "true",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    typecheck: {
      tsconfig: "./tsconfig.json",
    },
  },
});
