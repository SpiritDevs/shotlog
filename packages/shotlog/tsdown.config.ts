import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/node.ts"],
  format: ["esm", "cjs"],
  target: "es2022",
  platform: "neutral",
  fixedExtension: false,
  dts: true,
  clean: true,
});
