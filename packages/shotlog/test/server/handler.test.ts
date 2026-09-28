import { createHmac } from "node:crypto";
import { Schema } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SupportLogSchema } from "../../src/internal/schema/support-log.js";
import {
  createSupportHandler,
  DeliveryFailed,
  Forbidden,
  type ShotlogStore,
  type SupportHandlerConfig,
  Unauthorized,
  verifyWebhookSignature,
} from "../../src/server.js";
import { png, request, submission } from "./fixtures.js";

const secret = "integration-test-secret";
const delivery = {
  webhook: { url: "https://receiver.example.com/logs", secret },
};
const fetchStub = vi.fn<typeof fetch>();
const handler = (overrides: Partial<SupportHandlerConfig> = {}) =>
  createSupportHandler({
    delivery,
    authorize: () => true,
    rateLimit: false,
    ...overrides,
  });

beforeEach(() => {
  fetchStub
    .mockReset()
    .mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("delivers a schema-valid Support Log with inline PNG and independently verifiable signature", async () => {
  const log = { ...submission(), reporter: { id: "user-42", plan: "pro" } };
  const response = await handler()(
    request(log, new Blob([png], { type: "image/png" })),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    id: log.id,
    shortId: log.shortId,
    duplicate: false,
  });
  expect(fetchStub).toHaveBeenCalledOnce();
  const [url, init] = fetchStub.mock.calls[0] ?? [];
  expect(url).toBe(delivery.webhook.url);
  expect(init?.method).toBe("POST");
  expect(init?.redirect).toBe("manual");
  const payload = String(init?.body);
  const received = Schema.decodeUnknownSync(SupportLogSchema)(
    JSON.parse(payload),
  );
  expect(received).toEqual({
    ...log,
    screenshot: {
      _tag: "Inline",
      data: Buffer.from(png).toString("base64"),
      width: 1,
      height: 1,
      size: png.length,
      mimeType: "image/png",
    },
  });
  const headers = new Headers(init?.headers);
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("x-shotlog-id")).toBe(log.id);
  const header = headers.get("x-shotlog-signature");
  expect(await verifyWebhookSignature({ payload, header, secret })).toBe(true);
  const timestamp = header?.match(/^t=(\d+),/)?.[1];
  expect(header).toBe(
    `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`,
  );
  expect(
    await verifyWebhookSignature({ payload: `${payload} `, header, secret }),
  ).toBe(false);
  expect(
    await verifyWebhookSignature({ payload, header, secret: "wrong-secret" }),
  ).toBe(false);
});

test("rejects malformed and out-of-tolerance signatures, while honoring an explicit tolerance", async () => {
  const payload = "{}";
  for (const skew of [-600, 600]) {
    const timestamp = Math.floor(Date.now() / 1000) + skew;
    const header = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
    expect(await verifyWebhookSignature({ payload, header, secret })).toBe(
      false,
    );
    expect(
      await verifyWebhookSignature({
        payload,
        header,
        secret,
        toleranceSeconds: 700,
      }),
    ).toBe(true);
  }
  for (const header of [
    null,
    "",
    "t=1,v1=nope",
    `t=NaN,v1=${"a".repeat(64)}`,
  ]) {
    expect(await verifyWebhookSignature({ payload, header, secret })).toBe(
      false,
    );
  }
});

test.each([
  {
    status: 401,
    tag: "Unauthorized",
    authorize: () => {
      throw new Unauthorized();
    },
  },
  {
    status: 403,
    tag: "Forbidden",
    authorize: async () => {
      throw new Forbidden();
    },
  },
  { status: 403, tag: "Forbidden", authorize: () => false },
])(
  "authorization returns $status/$tag without reading the body",
  async ({ status, tag, authorize }) => {
    const input = request();
    const response = await handler({ authorize })(input);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { _tag: tag },
    });
    expect(input.bodyUsed).toBe(false);
    expect(fetchStub).not.toHaveBeenCalled();
  },
);

test.each([
  new Error("private auth details"),
  new DeliveryFailed("email", "private provider details"),
])(
  "logs unexpected authorization throws as defects and returns a generic 500",
  async (cause) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handler({
      authorize: () => {
        throw cause;
      },
    })(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        _tag: "DeliveryFailed",
        channel: "webhook",
        message: "The Support Log could not be processed",
      },
    });
    expect(logged).toHaveBeenCalledOnce();
    expect(fetchStub).not.toHaveBeenCalled();
  },
);

test("warns once at creation when authorization is omitted", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const handle = createSupportHandler({ delivery, rateLimit: false });
  expect(warn).toHaveBeenCalledOnce();
  await handle(request());
  await handle(request(submission(2)));
  expect(warn).toHaveBeenCalledOnce();
});

test("checks method, multipart content type, and declared size before authorization", async () => {
  const authorize = vi.fn(() => true);
  const handle = handler({ authorize, limits: { screenshotBytes: 100 } });
  const method = await handle(new Request("https://app.example.com/support"));
  expect(method.status).toBe(405);
  expect(await method.text()).toBe("");
  expect(
    (
      await handle(
        new Request("https://app.example.com/support", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(400);
  const oversized = request(submission(), undefined, {
    "content-length": "1000000",
  });
  expect((await handle(oversized)).status).toBe(413);
  expect(oversized.bodyUsed).toBe(false);
  expect(authorize).not.toHaveBeenCalled();
});

test.each([undefined, "1"])(
  "bounds a streamed body even with Content-Length %s, and cancels the source early",
  async (length) => {
    const source = request(
      submission(),
      new Blob([new Uint8Array(1024 * 1024)]),
    );
    const bytes = new Uint8Array(await source.arrayBuffer());
    let offset = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) controller.close();
        else {
          controller.enqueue(bytes.subarray(offset, offset + 16 * 1024));
          offset += 16 * 1024;
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers = new Headers(source.headers);
    if (length) headers.set("content-length", length);
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    };
    const response = await handler({ limits: { screenshotBytes: 100 } })(
      new Request(source.url, init),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { _tag: "PayloadTooLarge" },
    });
    expect(offset).toBeLessThan(bytes.length);
    expect(cancelled).toBe(true);
    expect(fetchStub).not.toHaveBeenCalled();
  },
);

test("enforces JSON and PNG part limits independently of the total body cap", async () => {
  const largeJson = request({
    ...submission(),
    environment: { ...submission().environment, title: "x".repeat(256 * 1024) },
  });
  expect((await handler()(largeJson)).status).toBe(413);
  const response = await handler({
    limits: { screenshotBytes: png.length - 1 },
  })(request(submission(), new Blob([png])));
  expect(response.status).toBe(413);
  expect(fetchStub).not.toHaveBeenCalled();
});

test("rejects invalid JSON, invalid submissions, and PNG impostors with useful validation errors", async () => {
  const invalid = await handler()(
    request({ ...submission(), description: "" }),
  );
  expect(invalid.status).toBe(400);
  const body: unknown = await invalid.json();
  expect(body).toMatchObject({
    error: {
      _tag: "ValidationFailed",
      issues: [expect.stringContaining("description")],
    },
  });
  const form = new FormData();
  form.set("supportLog", "{invalid json");
  expect(
    (
      await handler()(
        new Request("https://app.example.com/support", {
          method: "POST",
          body: form,
        }),
      )
    ).status,
  ).toBe(400);
  const brokenHeader = png.slice();
  brokenHeader[12] = 0;
  for (const bytes of [
    new TextEncoder().encode("not a PNG"),
    png.slice(0, 24),
    brokenHeader,
  ]) {
    const response = await handler()(
      request(submission(), new Blob([bytes], { type: "image/png" })),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { _tag: "ValidationFailed" },
    });
  }
  expect(fetchStub).not.toHaveBeenCalled();
});

test("accepts a JSON Blob part and rejects ambiguous multipart fields", async () => {
  const form = new FormData();
  form.set(
    "supportLog",
    new Blob([JSON.stringify(submission())], { type: "application/json" }),
  );
  const send = () =>
    handler()(
      new Request("https://app.example.com/support", {
        method: "POST",
        body: form,
      }),
    );
  expect((await send()).status).toBe(200);
  form.append("supportLog", JSON.stringify(submission(2)));
  expect((await send()).status).toBe(400);
});

test("limits the first forwarded IP before parsing and sends Retry-After", async () => {
  const handle = handler({ rateLimit: { max: 1, windowSeconds: 600 } });
  expect(
    (
      await handle(
        request(submission(), undefined, {
          "x-forwarded-for": "192.0.2.1, 192.0.2.2",
        }),
      )
    ).status,
  ).toBe(200);
  const next = request({ invalid: true }, undefined, {
    "x-forwarded-for": "192.0.2.1, 192.0.2.3",
  });
  const response = await handle(next);
  expect(response.status).toBe(429);
  const retryAfter = Number(response.headers.get("retry-after"));
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(600);
  expect(await response.json()).toMatchObject({
    error: { _tag: "RateLimited", retryAfterSeconds: retryAfter },
  });
  expect(next.bodyUsed).toBe(false);
  expect(fetchStub).toHaveBeenCalledOnce();
});

test("limits the authenticated reporter across IPs and ignores body-supplied reporter ids", async () => {
  const session = { current: "user-1" };
  const handle = handler({
    rateLimit: { max: 1 },
    authorize: () => ({ reporterId: session.current }),
  });
  const send = (n: number, ip: string, reporterId: string) =>
    handle(
      request({ ...submission(n), reporter: { id: reporterId } }, undefined, {
        "cf-connecting-ip": ip,
      }),
    );
  expect((await send(1, "192.0.2.1", "user-1")).status).toBe(200);
  // Same session from another IP is limited.
  expect((await send(2, "192.0.2.2", "user-1")).status).toBe(429);
  // Naming user-1 in the body doesn't touch user-2's limit.
  session.current = "user-2";
  expect((await send(3, "192.0.2.3", "user-1")).status).toBe(200);
  expect(fetchStub).toHaveBeenCalledTimes(2);
});

test("honors the IP override and defaults to five requests when rateLimit is omitted", async () => {
  const handle = createSupportHandler({
    delivery,
    authorize: () => true,
    getClientIp: () => "trusted-ip",
  });
  for (let index = 1; index <= 6; index += 1) {
    const response = await handle(
      request(submission(index), undefined, {
        "x-forwarded-for": `192.0.2.${index}`,
      }),
    );
    expect(response.status).toBe(index <= 5 ? 200 : 429);
  }
  expect(fetchStub).toHaveBeenCalledTimes(5);
});

test("dedupes completed and concurrent IDs, but retries an ID after failed delivery", async () => {
  const handle = handler();
  const responses = await Promise.all([handle(request()), handle(request())]);
  const results: unknown[] = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ duplicate: false }),
      expect.objectContaining({ duplicate: true }),
    ]),
  );
  expect(await (await handle(request())).json()).toMatchObject({
    duplicate: true,
  });
  expect(fetchStub).toHaveBeenCalledOnce();

  fetchStub.mockImplementationOnce(
    async () => new Response(null, { status: 400 }),
  );
  expect((await handle(request(submission(2)))).status).toBe(502);
  expect(await (await handle(request(submission(2)))).json()).toMatchObject({
    duplicate: false,
  });
  expect(fetchStub).toHaveBeenCalledTimes(3);
});

test("uses a supplied store for both limits and completed dedupe across handler instances", async () => {
  const values = new Map<string, number>();
  const store: ShotlogStore = {
    get: vi.fn(async (key: string) => values.get(key)),
    increment: vi.fn(async (key: string, _ttl: number) => {
      const value = (values.get(key) ?? 0) + 1;
      values.set(key, value);
      return value;
    }),
  };
  const config = { store, rateLimit: { max: 3 } };
  const first = handler(config);
  const second = handler(config);
  const ip = { "x-forwarded-for": "203.0.113.7" };
  expect((await first(request(undefined, undefined, ip))).status).toBe(200);
  expect(
    await (await second(request(undefined, undefined, ip))).json(),
  ).toMatchObject({
    duplicate: true,
  });
  expect(store.increment).toHaveBeenCalledWith(
    `shotlog:delivered:${submission().id}:webhook`,
    86400,
  );
  expect(store.increment).toHaveBeenCalledWith(
    expect.stringContaining("shotlog:rate:ip:"),
    expect.any(Number),
  );
  expect(fetchStub).toHaveBeenCalledOnce();
});

test("retries webhook 5xx twice and returns 502 without marking the ID delivered", async () => {
  fetchStub.mockImplementation(async () => new Response(null, { status: 503 }));
  const handle = handler();
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { _tag: "DeliveryFailed", channel: "webhook" },
  });
  expect(fetchStub).toHaveBeenCalledTimes(3);
  fetchStub.mockImplementation(async () => new Response(null, { status: 204 }));
  expect(await (await handle(request())).json()).toMatchObject({
    duplicate: false,
  });
  expect(fetchStub).toHaveBeenCalledTimes(4);
});

test("retries network failures, but does not retry non-5xx HTTP failures or redirects", async () => {
  fetchStub.mockRejectedValueOnce(new TypeError("network unavailable"));
  expect((await handler()(request())).status).toBe(200);
  expect(fetchStub).toHaveBeenCalledTimes(2);
  for (const status of [302, 400, 429]) {
    fetchStub
      .mockClear()
      .mockImplementation(async () => new Response(null, { status }));
    expect((await handler()(request())).status).toBe(502);
    expect(fetchStub).toHaveBeenCalledOnce();
  }
});

test("timeouts abort each stalled webhook attempt", async () => {
  const signals: AbortSignal[] = [];
  fetchStub.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        if (!init?.signal) throw new Error("Missing cancellation signal");
        signals.push(init.signal);
        init.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      }),
  );
  const response = await handler({
    delivery: { webhook: { ...delivery.webhook, timeoutMs: 10 } },
  })(request());
  expect(response.status).toBe(502);
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

test("rejects work beyond concurrentRequests before reading the body", async () => {
  let release = () => {};
  fetchStub.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(new Response(null, { status: 204 }));
      }),
  );
  const handle = handler({ limits: { concurrentRequests: 1 } });
  const first = handle(request(submission(1)));
  await vi.waitFor(() => expect(fetchStub).toHaveBeenCalledOnce());
  const busy = await handle(request(submission(2)));
  expect(busy.status).toBe(429);
  expect(busy.headers.get("retry-after")).toBe("5");
  release();
  expect((await first).status).toBe(200);
  fetchStub.mockImplementation(async () => new Response(null, { status: 204 }));
  expect((await handle(request(submission(3)))).status).toBe(200);
});

test.each([
  { limits: { screenshotBytes: Number.NaN } },
  { limits: { concurrentRequests: 0 } },
  { rateLimit: { max: Number.POSITIVE_INFINITY } },
])("rejects invalid numeric config at creation: %j", (overrides) => {
  expect(() => handler(overrides)).toThrow(TypeError);
});
