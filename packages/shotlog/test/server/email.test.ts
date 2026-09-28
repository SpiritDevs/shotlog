import { afterEach, expect, test, vi } from "vitest";
import { renderEmail } from "../../src/server/email-template.js";
import {
  createSupportHandler,
  type EmailConfig,
  type EmailMessage,
} from "../../src/server.js";
import { png, request, submission } from "./fixtures.js";

const config: EmailConfig = {
  from: "reports@example.com",
  to: ["support@example.com"],
  provider: { name: "test", send: async () => {} },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("escapes all report values and labels, preserving JSON metadata and plain text", () => {
  const attack = '<script>alert("x")</script>&\'';
  const log = {
    ...submission(),
    type: attack,
    description: attack,
    reporter: { name: attack, [attack]: attack },
    metadata: { [attack]: { nested: [attack] } },
    environment: { ...submission().environment, title: attack, url: attack },
    diagnostics: {
      console: [
        {
          at: submission().createdAt,
          level: "error" as const,
          message: attack,
          stack: attack,
        },
      ],
      network: [
        {
          at: submission().createdAt,
          method: attack,
          url: attack,
          status: 500,
        },
      ],
    },
  };
  const message = renderEmail(
    { ...config, labels: { description: attack } },
    log,
    { bytes: png, width: 1, height: 1 },
  );
  expect(message.html).not.toContain("<script>");
  expect(message.html).not.toContain(attack);
  expect(message.html).toContain(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;",
  );
  expect(message.html).toContain("{&quot;nested&quot;:[");
  expect(message.text).toContain(JSON.stringify(log.metadata[attack]));
  expect(message.text).toContain(attack);
  expect(message.attachments).toHaveLength(2);
  expect(message.html).toContain(`cid:${message.attachments[0]?.contentId}`);
  expect(message.attachments[1]?.contentId).toBeUndefined();
});

test("formats the subject using the trimmed first line and truncates at 80 Unicode characters", () => {
  const log = {
    ...submission(),
    description: "  Save did not work  \nSecond line",
  };
  expect(renderEmail(config, log).subject).toBe(
    `[Bug] ${log.shortId} · Save did not work`,
  );
  const long = renderEmail(config, {
    ...log,
    type: "Bug\r\nBcc: injected",
    description: "🚀".repeat(90),
  });
  expect(long.subject).toBe(
    `[Bug Bcc: injected] ${log.shortId} · ${"🚀".repeat(79)}…`,
  );
  expect(long.subject).not.toMatch(/[\r\n]/);
});

test.each([
  ["person+tag@example.com", "person+tag@example.com"],
  [" person@example.com ", "person@example.com"],
  ["person@example.com\r\nBcc: attacker@example.com", undefined],
  ["person@example.com\n", undefined],
  ["person@example.com,attacker@example.com", undefined],
  ["Name <person@example.com>", undefined],
  ["person..name@example.com", undefined],
  ["person@-example.com", undefined],
  ["not an address", undefined],
])("sets Reply-To only for one safe bare address: %s", (email, expected) => {
  const message = renderEmail(config, {
    ...submission(),
    reporter: { email: email ?? "" },
  });
  expect(message.replyTo).toBe(expected);
  expect(message.to).toEqual(["support@example.com"]);
});

test.each(["email", "webhook"] as const)(
  "retries only the failed %s channel and coalesces in-flight submissions",
  async (failedChannel) => {
    let fail = true;
    let release = () => {};
    let signalStarted = () => {};
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const send = vi.fn(async (_message: EmailMessage) => {
      signalStarted();
      if (fail)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (fail && failedChannel === "email") throw new Error("Email failed");
    });
    const webhook = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: fail && failedChannel === "webhook" ? 400 : 204,
        }),
    );
    vi.stubGlobal("fetch", webhook);
    const handler = createSupportHandler({
      delivery: {
        email: { ...config, provider: { name: "test", send } },
        webhook: { url: "https://example.com/inbox", secret: "test" },
      },
      authorize: () => true,
      rateLimit: false,
    });
    const first = handler(request());
    await started;
    const concurrentRequest = request();
    const joined = handler(concurrentRequest);
    // Wait until the second copy has parsed its body and joined the pending send.
    await vi.waitFor(() => expect(concurrentRequest.bodyUsed).toBe(true));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    release();
    const responses = await Promise.all([first, joined]);
    for (const response of responses) {
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        error: { _tag: "DeliveryFailed", channel: failedChannel },
      });
    }
    expect(send).toHaveBeenCalledOnce();
    expect(webhook).toHaveBeenCalledOnce();
    fail = false;
    expect(await (await handler(request())).json()).toMatchObject({
      ok: true,
      duplicate: false,
    });
    expect(send).toHaveBeenCalledTimes(failedChannel === "email" ? 2 : 1);
    expect(webhook).toHaveBeenCalledTimes(failedChannel === "webhook" ? 2 : 1);
    expect(await (await handler(request())).json()).toMatchObject({
      duplicate: true,
    });
    expect(send).toHaveBeenCalledTimes(failedChannel === "email" ? 2 : 1);
    expect(webhook).toHaveBeenCalledTimes(failedChannel === "webhook" ? 2 : 1);
  },
);

test("generic 500 responses prefer email when both channels are configured", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const handler = createSupportHandler({
    delivery: {
      email: config,
      webhook: { url: "https://example.com/inbox", secret: "test" },
    },
    authorize: () => {
      throw new Error("Private session details");
    },
  });
  const response = await handler(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    ok: false,
    error: {
      _tag: "DeliveryFailed",
      channel: "email",
      message: "The Support Log could not be processed",
    },
  });
  expect(logged).toHaveBeenCalledOnce();
});
