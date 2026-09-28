import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("CI changeset checks use explicit bases available in detached checkouts", () => {
  const ci = read(".github/workflows/ci.yml");
  const commands = ci.match(/pnpm exec changeset status[^\n]*/g);
  expect(commands).toEqual([
    "pnpm exec changeset status --since=origin/main",
    'pnpm exec changeset status --since="$BEFORE"',
  ]);
  expect(ci).toContain("github.head_ref != 'changeset-release/main'");
  expect(ci).toMatch(/BEFORE: \$\{\{ github\.event\.before \}\}/);
});

test("site deployment requires a smoke-verified latest publish and all Vercel secrets", () => {
  const release = read(".github/workflows/release.yml");
  expect(release).toMatch(
    /published: \$\{\{ steps\.latest\.outputs\.published \}\}/,
  );
  expect(release).toMatch(
    /id: latest\s+if: inputs.tag != 'next'\s+uses: changesets\/action@v1/,
  );
  const job = release.split("\n  deploy-site:\n")[1] ?? "";
  expect(job).toContain("needs: publish");
  const condition = job.match(/if: >-\n([\s\S]*?)\n {4}runs-on:/)?.[1];
  expect(condition).toBeDefined();
  for (const [result, published, tag, skip, expected] of [
    ["success", "true", "latest", false, true],
    ["success", "true", undefined, undefined, true],
    ["failure", "true", "latest", false, false],
    ["success", "false", "latest", false, false],
    ["success", "", "latest", false, false],
    ["success", "true", "next", false, false],
    ["success", "true", "latest", true, false],
  ] as const) {
    expect(
      runInNewContext(condition ?? "false", {
        needs: { publish: { result, outputs: { published } } },
        inputs: { tag, skip_smoke: skip },
      }),
    ).toBe(expected);
  }
  const script = job.match(/run: \|\n([\s\S]*?)\n {6}- uses:/)?.[1];
  expect(script).toBeDefined();
  const dir = mkdtempSync(join(tmpdir(), "shotlog-deploy-test-"));
  try {
    const output = join(dir, "output");
    const secrets = ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"];
    for (const missing of [undefined, ...secrets]) {
      writeFileSync(output, "");
      const env: Record<string, string> = { GITHUB_OUTPUT: output };
      for (const secret of secrets)
        env[secret] = secret === missing ? "" : "test-only";
      const notice = execFileSync("/bin/bash", ["-eu", "-c", script ?? ""], {
        env,
        encoding: "utf8",
      });
      expect(readFileSync(output, "utf8")).toBe(
        missing ? "" : "configured=true\n",
      );
      if (missing)
        expect(notice).toContain("::notice::Skipping site deployment");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expect(job).toMatch(
    /if: steps.secrets.outputs.configured == 'true'\s+run: npx --yes vercel deploy --prod/,
  );
  expect(
    JSON.parse(read("apps/site/vercel.json")).git.deploymentEnabled.main,
  ).toBe(false);
});
