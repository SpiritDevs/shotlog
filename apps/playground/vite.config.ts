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
      { find: /^shotlog\/(.+)$/, replacement: source("$1") },
    ],
    dedupe: ["react", "react-dom"],
  },
  // Lets the Playground be shared through a Cloudflare quick tunnel.
  server: { allowedHosts: [".trycloudflare.com"] },
});
