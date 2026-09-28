import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Invoked only at the publish boundary, so opening a Changesets PR sends no email.
assert(
  process.env.GITHUB_ACTIONS === "true",
  "Publish through the Release workflow",
);
assert(
  !existsSync(".changeset/pre.json"),
  "Use the next snapshot dispatch, not Changesets pre mode",
);
const next = process.argv.includes("--next");
const skip = process.env.SMOKE_SKIP === "true";
const { version } = JSON.parse(
  readFileSync("packages/shotlog/package.json", "utf8"),
) as { version: string };

function run(args: string[], extraEnv: Record<string, string> = {}): void {
  const child = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (child.error || child.status !== 0) process.exit(child.status ?? 1);
}

if (next) {
  assert(
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "next requires a manual dispatch",
  );
  assert(!skip, "The smoke override is only for latest");
  assert(
    /^0\.0\.0-next-\d{14}$/.test(version),
    "next must contain a generated next snapshot version",
  );
  run(["build"]);
  run(["exec", "changeset", "publish", "--tag", "next", "--no-git-tag"], {
    NPM_CONFIG_PROVENANCE: "true",
  });
} else {
  assert(
    /^\d+\.\d+\.\d+$/.test(version) && version !== "0.0.0",
    "latest requires a versioned stable release",
  );
  if (skip) {
    assert(
      process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        process.env.SMOKE_OVERRIDE_REASON?.trim(),
      "Override requires a manual dispatch and a reason",
    );
    console.error(
      "WARNING: PRODUCTION SMOKE TEST BYPASSED. Reason recorded in the workflow job summary.",
    );
    run(["build"]);
  } else {
    run(["smoke"], { SMOKE_REQUIRE_ALL: "1" });
  }
  run(["exec", "changeset", "publish", "--tag", "latest"], {
    NPM_CONFIG_PROVENANCE: "true",
  });
}
