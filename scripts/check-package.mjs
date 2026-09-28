import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pkg = new URL("packages/shotlog/", root);
const manifest = JSON.parse(readFileSync(new URL("package.json", pkg), "utf8"));
const packed = JSON.parse(
  execFileSync("pnpm", ["--filter", "shotlog", "pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
  }),
);
const files = new Set(packed.files.map(({ path }) => path));
const dist = readdirSync(new URL("dist/", pkg), { recursive: true });
// These two lazy entry points must exist, not merely be included if built.
for (const entry of ["editor", "page-render"])
  assert(
    dist.some((file) => file.startsWith(`${entry}-`) && file.endsWith(".js")),
    `Missing built lazy entry: ${entry}`,
  );
function targets(value) {
  return typeof value === "string"
    ? [value]
    : Object.values(value).flatMap(targets);
}
const required = [
  "dist/index.js",
  "schema/support-log.v1.json",
  ...targets(manifest.exports).map((target) => target.replace(/^\.\//, "")),
  ...dist
    .filter((file) => /\.(?:js|ts)$/.test(file))
    .map((file) => `dist/${file}`),
];
for (const file of required)
  assert(files.has(file), `Missing from package: ${file}`);
console.log(
  `Package contents verified: ${files.size} files, including every export and built chunk.`,
);
