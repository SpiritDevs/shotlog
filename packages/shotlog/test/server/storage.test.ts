import { Schema } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SupportLogSchema } from "../../src/internal/schema/support-log.js";
import {
  createSupportHandler,
  DeliveryFailed,
  type EmailMessage,
  type StorageAdapter,
  verifyWebhookSignature,
  type WebhookConfig,
} from "../../src/server.js";
import { png, request, submission } from "./fixtures.js";

const uploaded = {
  url: "https://files.example.com/screenshot",
  key: "file-key",
};
const upload = vi.fn<StorageAdapter["upload"]>();
const storage: StorageAdapter = { name: "test", upload };
const fetchStub = vi.fn<typeof fetch>();
const webhook = {
  url: "https://receiver.example.com/logs",
  secret: "test-secret",
  screenshotMode: "upload",
  storage,
} satisfies WebhookConfig;
const screenshotRequest = () =>
  request(submission(), new Blob([png], { type: "image/png" }));
const handle = (config: WebhookConfig = webhook) =>
  createSupportHandler({
    delivery: { webhook: config },
    authorize: () => true,
    rateLimit: false,
  });
const received = () =>
  Schema.decodeUnknownSync(SupportLogSchema)(
    JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body)),
  );

beforeEach(() => {
  upload.mockReset().mockResolvedValue(uploaded);
  fetchStub
    .mockReset()
    .mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("rejects upload mode without storage at handler creation", () => {
  const { storage: _storage, ...config } = webhook;
  // @ts-expect-error JavaScript callers still receive a defensive runtime error.
  expect(() => handle(config)).toThrow(TypeError);
});

test("uploads once across email, webhook retries, concurrent requests, and delivered-ID dedupe", async () => {
  const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => {});
  fetchStub.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const handler = createSupportHandler({
    delivery: {
      webhook,
      email: {
        from: "reports@example.com",
        to: "support@example.com",
        provider: { name: "test", send },
      },
    },
    authorize: () => true,
    rateLimit: false,
  });
  const responses = await Promise.all([
    handler(screenshotRequest()),
    handler(screenshotRequest()),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(await (await handler(screenshotRequest())).json()).toMatchObject({
    duplicate: true,
  });
  expect(upload).toHaveBeenCalledExactlyOnceWith(png, {
    id: submission().id,
    filename: `support-log-${submission().id}.png`,
    signal: expect.any(AbortSignal),
  });
  expect(received().screenshot).toEqual({
    _tag: "Uploaded",
    ...uploaded,
    width: 1,
    height: 1,
    size: png.length,
    mimeType: "image/png",
  });
  expect(fetchStub).toHaveBeenCalledTimes(2);
  const init = fetchStub.mock.calls[0]?.[1];
  expect(fetchStub.mock.calls[1]?.[1]?.body).toBe(init?.body);
  expect(
    await verifyWebhookSignature({
      payload: String(init?.body),
      header: new Headers(init?.headers).get("x-shotlog-signature"),
      secret: webhook.secret,
    }),
  ).toBe(true);
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]?.[0].attachments).toEqual([
    expect.objectContaining({
      content: png,
      contentId: `screenshot-${submission().id}@shotlog`,
    }),
    expect.objectContaining({ content: png }),
  ]);
});

test("does not re-upload a delivered webhook when only email needs retrying", async () => {
  const send = vi
    .fn<(message: EmailMessage) => Promise<void>>()
    .mockRejectedValueOnce(new DeliveryFailed("email"))
    .mockResolvedValue(undefined);
  const handler = createSupportHandler({
    delivery: {
      webhook,
      email: {
        from: "reports@example.com",
        to: "support@example.com",
        provider: { name: "test", send },
      },
    },
    authorize: () => true,
    rateLimit: false,
  });
  expect((await handler(screenshotRequest())).status).toBe(502);
  expect((await handler(screenshotRequest())).status).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
  expect(upload).toHaveBeenCalledOnce();
  expect(fetchStub).toHaveBeenCalledOnce();
});

test.each([undefined, "base64"] as const)(
  "mode %s keeps inline PNG without calling storage",
  async (screenshotMode) => {
    const { screenshotMode: _mode, storage: _storage, ...config } = webhook;
    const handler = handle({
      ...config,
      ...(screenshotMode ? { screenshotMode } : {}),
    });
    expect((await handler(screenshotRequest())).status).toBe(200);
    expect(received().screenshot).toMatchObject({
      _tag: "Inline",
      data: Buffer.from(png).toString("base64"),
    });
    expect(received().screenshot).not.toHaveProperty("uploadError");
    expect(upload).not.toHaveBeenCalled();
  },
);

test("upload mode skips storage when the Support Log has no Screenshot", async () => {
  expect((await handle()(request())).status).toBe(200);
  expect(received()).not.toHaveProperty("screenshot");
  expect(upload).not.toHaveBeenCalled();
});

test.each(["throw", "reject"])(
  "falls back on adapter %s without leaking its error or losing the log",
  async (failure) => {
    const privateError = new Error("secret-token and private bucket URL");
    upload.mockImplementation(() => {
      if (failure === "throw") throw privateError;
      return Promise.reject(privateError);
    });
    const handler = handle();
    expect((await handler(screenshotRequest())).status).toBe(200);
    expect(received()).toEqual({
      ...submission(),
      screenshot: {
        _tag: "Inline",
        data: Buffer.from(png).toString("base64"),
        width: 1,
        height: 1,
        size: png.length,
        mimeType: "image/png",
        uploadError: "Screenshot upload failed",
      },
    });
    expect(await (await handler(screenshotRequest())).json()).toMatchObject({
      duplicate: true,
    });
    expect(upload).toHaveBeenCalledOnce();
  },
);

test("aborts a stalled upload at 10 seconds and delivers inline fallback", async () => {
  let signal: AbortSignal | undefined;
  const aborted = vi.fn();
  upload.mockImplementation((_png, info) => {
    signal = info.signal;
    return new Promise((_resolve, reject) => {
      info.signal.addEventListener(
        "abort",
        () => {
          aborted();
          reject(new Error("private cancellation details"));
        },
        { once: true },
      );
    });
  });
  vi.useFakeTimers();
  const response = handle()(screenshotRequest());
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(9_000);
  expect(signal?.aborted).toBe(false);
  expect(fetchStub).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  expect((await response).status).toBe(200);
  expect(signal?.aborted).toBe(true);
  expect(aborted).toHaveBeenCalledOnce();
  expect(received().screenshot).toMatchObject({
    _tag: "Inline",
    data: Buffer.from(png).toString("base64"),
    uploadError: "Screenshot upload timed out",
  });
});

test.each([
  { url: "javascript:alert(1)", key: "file-key" },
  { url: uploaded.url, key: "" },
])("falls back inline for invalid storage output: %j", async (result) => {
  upload.mockResolvedValue(result);
  expect((await handle()(screenshotRequest())).status).toBe(200);
  expect(received().screenshot).toEqual({
    _tag: "Inline",
    data: Buffer.from(png).toString("base64"),
    width: 1,
    height: 1,
    size: png.length,
    mimeType: "image/png",
    uploadError: "Storage adapter returned an invalid result",
  });
});
