import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSONSchema } from "effect";
import { expect, test } from "vitest";
import {
  SupportLogSchema,
  schemaVersion,
} from "../src/internal/schema/support-log.js";

test("Support Log matches its immutable versioned JSON Schema", () => {
  const contract = new URL(
    `../schema/support-log.v${schemaVersion}.json`,
    import.meta.url,
  );
  expect(
    JSONSchema.make(SupportLogSchema, { target: "jsonSchema2020-12" }),
  ).toEqual(JSON.parse(readFileSync(contract, "utf8")));
  const base = process.env.SHOTLOG_CONTRACT_BASE;
  const changed = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=MD",
      base && !/^0+$/.test(base) ? base : "HEAD",
      "--",
      "packages/shotlog/schema/support-log.v*.json",
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
    },
  );
  expect(
    changed.trim(),
    "Existing schema versions are immutable; add a new versioned file.",
  ).toBe("");
});
