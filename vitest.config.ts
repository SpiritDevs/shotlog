import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/shotlog/test/**/*.test.ts"],
    typecheck: {
      enabled: true,
      tsconfig: "packages/shotlog/test/tsconfig.json",
      include: ["packages/shotlog/test/**/*.test-d.ts"],
    },
  },
});
