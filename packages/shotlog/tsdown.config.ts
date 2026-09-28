import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/node.ts",
    "src/ses.ts",
    "src/smtp.ts",
    "src/uploadfile.ts",
  ],
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  fixedExtension: false,
  deps: { neverBundle: [/^node:/] },
  dts: true,
  clean: true,
});
