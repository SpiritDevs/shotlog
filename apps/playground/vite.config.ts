import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const source = (entry: string) =>
  fileURLToPath(
    new URL(`../../packages/shotlog/src/${entry}.ts`, import.meta.url),
  );

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      { find: /^shotlog$/, replacement: source("index") },
      { find: /^shotlog\/server$/, replacement: source("server") },
      { find: /^shotlog\/node$/, replacement: source("node") },
    ],
    dedupe: ["react", "react-dom"],
  },
});
