import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(
  new URL("../packages/shotlog/dist", import.meta.url),
);
const files = readdirSync(dist, { recursive: true }).filter((file) =>
  /\.d\.[cm]?ts$/.test(file),
);
if (files.length === 0)
  throw new Error("No public declarations found. Run pnpm build first.");
const failures = files.filter((file) =>
  /\beffect\b|@effect\//i.test(readFileSync(join(dist, file), "utf8")),
);
if (failures.length)
  throw new Error(
    `Effect leaked into public declarations:\n${failures.join("\n")}`,
  );
console.log(
  `PASS: ${files.length} declaration files contain no Effect references.`,
);
