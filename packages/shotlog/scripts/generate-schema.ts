import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { JSONSchema } from "effect";
import {
  SupportLogSchema,
  schemaVersion,
} from "../src/internal/schema/support-log.js";

const path = new URL(
  `../schema/support-log.v${schemaVersion}.json`,
  import.meta.url,
);
const schema = JSONSchema.make(SupportLogSchema, {
  target: "jsonSchema2020-12",
});
if (existsSync(path)) {
  if (!isDeepStrictEqual(JSON.parse(readFileSync(path, "utf8")), schema)) {
    throw new Error(
      `Support Log v${schemaVersion} is frozen. Bump schemaVersion and add a new schema file.`,
    );
  }
  console.log(`Support Log v${schemaVersion} contract is unchanged.`);
} else {
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, { flag: "wx" });
  console.log(`Created ${path.pathname}`);
}
