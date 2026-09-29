import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    node: "src/node.ts",
    ses: "src/ses.ts",
    smtp: "src/smtp.ts",
    uploadfile: "src/uploadfile.ts",
    "locales/pt-BR": "src/locales/pt-BR.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  fixedExtension: false,
  deps: { neverBundle: [/^node:/] },
  dts: true,
  clean: true,
});
