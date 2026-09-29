import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  DeliveryConfig,
  StorageAdapter,
  SupportLog,
  SupportLogSubmission,
} from "shotlog/server";

// tsx otherwise follows the workspace's source aliases, even for require.resolve.
// Relaunch with those aliases disabled, then resolve the package's public exports.
const tsconfig = fileURLToPath(new URL("tsconfig.smoke.json", import.meta.url));
if (process.env.TSX_TSCONFIG_PATH !== tsconfig) {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(import.meta.url)],
    { stdio: "inherit", env: { ...process.env, TSX_TSCONFIG_PATH: tsconfig } },
  );
  process.exit(child.status ?? 1);
}

const packageRoot = new URL("../packages/shotlog/", import.meta.url);
const requirePackage = createRequire(new URL("package.json", packageRoot));
function builtEntry(name: string): string {
  const entry = pathToFileURL(requirePackage.resolve(name)).href;
  assert(
    entry.startsWith(new URL("dist/", packageRoot).href),
    `${name} must resolve to dist`,
  );
  return entry;
}
const { createSupportHandler, getShortId, resend, verifyWebhookSignature } =
  (await import(
    builtEntry("shotlog/server")
  )) as typeof import("shotlog/server");
const { ses } = (await import(
  builtEntry("shotlog/ses")
)) as typeof import("shotlog/ses");
const { uploadfile } = (await import(
  builtEntry("shotlog/uploadfile")
)) as typeof import("shotlog/uploadfile");
const manifest = requirePackage("./package.json") as { version: string };
// A complete 1x1 RGB PNG, including valid chunk CRCs.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQaPgPAAJjAaB56d6tAAAAAElFTkSuQmCC",
  "base64",
);

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function submission(channel: string): SupportLogSubmission {
  const id = randomUUID();
  return {
    schemaVersion: 2,
    id,
    shortId: getShortId(id),
    createdAt: new Date().toISOString(),
    type: "Bug",
    description: `shotlog production smoke: ${channel} (${id})`,
    environment: {
      url: "https://shotlog.dev/smoke",
      route: "/smoke",
      title: "Production Smoke Test",
      referrer: "",
      timeOnPageMs: 0,
      userAgent: `Node ${process.version}`,
      browser: "Smoke Test",
      os: process.platform,
      deviceType: "unknown",
      language: "en",
      timezone: "UTC",
      screen: { width: 1, height: 1 },
      viewport: { width: 1, height: 1 },
      devicePixelRatio: 1,
      colorScheme: "light",
      online: true,
      libraryVersion: manifest.version,
    },
  };
}

async function send(
  log: SupportLogSubmission,
  delivery: DeliveryConfig,
): Promise<void> {
  const handler = createSupportHandler({
    delivery,
    authorize: () => true,
    rateLimit: false,
  });
  const form = new FormData();
  form.set("supportLog", JSON.stringify(log));
  form.set(
    "screenshot",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    "smoke.png",
  );
  const response = await handler(
    new Request("https://shotlog.dev/smoke", { method: "POST", body: form }),
  );
  check(response.status === 200, `Relay returned HTTP ${response.status}`);
  const body = record(await response.json());
  check(
    body.ok === true && body.id === log.id && body.duplicate === false,
    "Relay did not acknowledge a fresh Support Log",
  );
}

// Only these deliberately safe messages reach the table; provider errors can contain secrets.
class SmokeFailure extends Error {}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new SmokeFailure(message);
}
function record(value: unknown): Record<string, unknown> {
  check(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "Invalid provider JSON",
  );
  return value as Record<string, unknown>;
}

async function verifyBody(
  payload: string,
  header: string | null,
  id: string | null,
  expected: SupportLogSubmission,
): Promise<SupportLog> {
  check(
    await verifyWebhookSignature({ payload, header, secret: webhookSecret }),
    "Webhook signature did not verify",
  );
  const body = record(JSON.parse(payload));
  check(
    id === expected.id &&
      body.id === expected.id &&
      body.description === expected.description,
    "Webhook Support Log did not match",
  );
  const screenshot = record(body.screenshot);
  check(
    screenshot.mimeType === "image/png" &&
      screenshot.size === png.length &&
      screenshot.width === 1 &&
      screenshot.height === 1,
    "Webhook PNG metadata did not match",
  );
  return body as unknown as SupportLog;
}

// Local signing uses a fresh, in-memory test key. External credentials come from env.
const webhookSecret = env("SMOKE_WEBHOOK_URL")
  ? env("SMOKE_WEBHOOK_SECRET")
  : randomBytes(32).toString("hex");

async function webhook(
  log: SupportLogSubmission,
  storage?: StorageAdapter,
): Promise<SupportLog> {
  let received: SupportLog | undefined;
  let receiverFailure: unknown;
  const externalUrl = env("SMOKE_WEBHOOK_URL")
    ? new URL(env("SMOKE_WEBHOOK_URL")).href
    : "";
  const originalFetch = globalThis.fetch;
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received = await verifyBody(
        Buffer.concat(chunks).toString("utf8"),
        request.headers["x-shotlog-signature"]?.toString() ?? null,
        request.headers["x-shotlog-id"]?.toString() ?? null,
        log,
      );
      response.writeHead(204).end();
    } catch (error) {
      receiverFailure = error;
      response.writeHead(400).end();
    }
  });
  try {
    let url = externalUrl;
    if (externalUrl) {
      // Observe the real signed wire body; the external receiver must acknowledge it.
      globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        if (request.url !== externalUrl || request.method !== "POST")
          return originalFetch(input, init);
        const payload = await request.clone().text();
        const response = await originalFetch(input, init);
        received = await verifyBody(
          payload,
          request.headers.get("x-shotlog-signature"),
          request.headers.get("x-shotlog-id"),
          log,
        );
        return response;
      };
    } else {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      check(
        address && typeof address !== "string",
        "Local receiver did not bind",
      );
      url = `http://127.0.0.1:${address.port}/`;
    }
    await send(log, {
      webhook: {
        url,
        secret: webhookSecret,
        ...(storage ? { screenshotMode: "upload", storage } : {}),
      },
    });
    if (receiverFailure) throw receiverFailure;
    check(received, "Webhook was not received");
    return received;
  } finally {
    globalThis.fetch = originalFetch;
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  }
}

async function smokeWebhook(): Promise<string> {
  const log = await webhook(submission("Webhook"));
  check(log.screenshot?._tag === "Inline", "Expected Inline Screenshot");
  check(
    png.equals(Buffer.from(log.screenshot.data, "base64")),
    "Webhook PNG bytes did not match",
  );
  return env("SMOKE_WEBHOOK_URL")
    ? "remote accepted; signature + PNG verified"
    : "local receipt; signature + PNG verified";
}

async function smokeResend(): Promise<string> {
  let emailId: unknown;
  const originalFetch = globalThis.fetch;
  // The public adapter discards the ID. Clone the real response, without mocking the send.
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (
      input === "https://api.resend.com/emails" &&
      init?.method === "POST" &&
      response.ok
    ) {
      emailId = record(await response.clone().json()).id;
    }
    return response;
  };
  try {
    await send(submission("Resend"), {
      email: {
        to: env("SMOKE_INBOX"),
        from: env("SMOKE_FROM"),
        provider: resend({ apiKey: env("RESEND_API_KEY") }),
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  check(
    typeof emailId === "string" && emailId.length > 0,
    "Resend accepted but returned no email ID",
  );
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `https://api.resend.com/emails/${encodeURIComponent(emailId)}`,
      {
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    check(
      response.ok,
      `Resend read API returned HTTP ${response.status} (full_access key required)`,
    );
    const email = record(await response.json());
    check(email.id === emailId, "Resend read API returned a different email");
    const status = email.last_event;
    if (status === "delivered" || status === "opened" || status === "clicked")
      return `accepted; delivery confirmed (${status})`;
    check(
      !["bounced", "canceled", "complained", "failed", "suppressed"].includes(
        String(status),
      ),
      "Resend reported a terminal delivery failure",
    );
    await delay(2_000);
  }
  throw new SmokeFailure("Resend accepted; delivery unconfirmed after 120s");
}

async function smokeSes(): Promise<string> {
  await send(submission("SES"), {
    email: {
      to: env("SMOKE_INBOX"),
      from: env("SMOKE_FROM"),
      provider: ses({ region: env("SMOKE_SES_REGION") }),
    },
  });
  return "provider accepted (inbox receipt not checked)";
}

async function smokeSlack(): Promise<string> {
  const slackApi = "https://slack.com/api/";
  const answers = new Map<string, Record<string, unknown>>();
  const originalFetch = globalThis.fetch;
  // Observe Slack's answers without mocking them; the relay itself swallows a failed share.
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = String(input);
    if (url.startsWith(slackApi))
      answers.set(url.slice(slackApi.length), await response.clone().json());
    return response;
  };
  try {
    await send(submission("Slack"), {
      slack: {
        token: env("SMOKE_SLACK_TOKEN"),
        channel: env("SMOKE_SLACK_CHANNEL"),
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const posted = answers.get("chat.postMessage");
  check(posted?.ok === true, "Slack did not accept the message");
  check(
    answers.get("files.completeUploadExternal")?.ok === true,
    "Slack did not share the Screenshot in the thread",
  );
  const fileId = record(
    answers.get("files.getUploadURLExternal") ?? {},
  ).file_id;
  const clean = async (method: string, params: Record<string, string>) => {
    const response = await fetch(`${slackApi}${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${env("SMOKE_SLACK_TOKEN")}` },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
    check(record(await response.json()).ok === true, `Slack ${method} failed`);
  };
  await clean("files.delete", { file: String(fileId) });
  await clean("chat.delete", {
    channel: String(posted.channel),
    ts: String(posted.ts),
  });
  return "posted; Screenshot shared in thread; deleted";
}

interface CleanupApi {
  deleteFiles(
    keys: string[],
    options?: { keyType: "customId" },
  ): Promise<{ success: boolean; deletedCount: number }>;
}

async function cleanup(
  api: CleanupApi,
  keys: Set<string>,
  id: string,
): Promise<void> {
  try {
    // customId also finds uploads whose private signing / adapter result failed.
    const deleted = keys.size
      ? await api.deleteFiles([...keys])
      : await api.deleteFiles([id], { keyType: "customId" });
    check(
      deleted.success && deleted.deletedCount >= keys.size,
      "UploadFile cleanup failed",
    );
  } catch {
    throw new SmokeFailure(
      "UploadFile cleanup failed; inspect the test app for leftover files",
    );
  }
}

async function smokeUpload(acl: "public-read" | "private"): Promise<string> {
  const { UFApi } = (await import(
    pathToFileURL(requirePackage.resolve("@uploadfile/core/server")).href
  )) as {
    UFApi: new (options: { token: string; fetch: typeof fetch }) => CleanupApi;
  };
  const api = new UFApi({
    token: env("UPLOADFILE_TOKEN"),
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  });
  const log = submission(`UploadFile ${acl}`);
  const adapter = uploadfile({ acl });
  const keys = new Set<string>();
  try {
    const body = await webhook(log, {
      name: adapter.name,
      async upload(bytes, info) {
        const result = await adapter.upload(bytes, info);
        keys.add(result.key); // Retain the key even if webhook delivery fails.
        return result;
      },
    });
    check(
      body.screenshot?._tag === "Uploaded",
      "Upload fell back to Inline; Uploaded URL required",
    );
    keys.add(body.screenshot.key);
    const response = await fetch(body.screenshot.url, {
      signal: AbortSignal.timeout(15_000),
    });
    check(
      response.status === 200,
      `Uploaded URL returned HTTP ${response.status}`,
    );
    check(
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() === "image/png",
      "Uploaded URL did not return image/png",
    );
    check(
      png.equals(Buffer.from(await response.arrayBuffer())),
      "Uploaded PNG bytes did not match",
    );
  } finally {
    await cleanup(api, keys, log.id);
  }
  return "Uploaded URL fetched; PNG matched; deleted";
}

const results: {
  channel: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}[] = [];
async function run(
  channel: string,
  required: string[],
  test: () => Promise<string>,
): Promise<void> {
  const missing = required.filter((name) => !env(name));
  if (missing.length) {
    results.push({
      channel,
      status: "SKIP",
      detail: `missing ${missing.join(", ")}`,
    });
    return;
  }
  try {
    results.push({ channel, status: "PASS", detail: await test() });
  } catch (error) {
    results.push({
      channel,
      status: "FAIL",
      detail:
        error instanceof SmokeFailure
          ? error.message
          : "Request, SDK, or response failed (provider details withheld)",
    });
  }
}

const webhookEnv = env("SMOKE_WEBHOOK_URL") ? ["SMOKE_WEBHOOK_SECRET"] : [];
await run("Webhook", webhookEnv, smokeWebhook);
await run(
  "Resend",
  ["RESEND_API_KEY", "SMOKE_FROM", "SMOKE_INBOX"],
  smokeResend,
);
await run(
  "SES",
  [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "SMOKE_SES_REGION",
    "SMOKE_FROM",
    "SMOKE_INBOX",
  ],
  smokeSes,
);
await run("Slack", ["SMOKE_SLACK_TOKEN", "SMOKE_SLACK_CHANNEL"], smokeSlack);
await run("UploadFile public", ["UPLOADFILE_TOKEN", ...webhookEnv], () =>
  smokeUpload("public-read"),
);
await run("UploadFile private", ["UPLOADFILE_TOKEN", ...webhookEnv], () =>
  smokeUpload("private"),
);
console.log(`\nshotlog ${manifest.version} — built-package smoke`);
console.log(`${"Channel".padEnd(20)} ${"Result".padEnd(6)} Detail`);
for (const result of results)
  console.log(
    `${result.channel.padEnd(20)} ${result.status.padEnd(6)} ${result.detail}`,
  );
const requireAll = env("SMOKE_REQUIRE_ALL") === "1";
if (requireAll)
  console.log("SMOKE_REQUIRE_ALL=1: every SKIP counts as a release failure.");
if (
  results.some(
    ({ status }) => status === "FAIL" || (requireAll && status === "SKIP"),
  )
)
  process.exitCode = 1;
