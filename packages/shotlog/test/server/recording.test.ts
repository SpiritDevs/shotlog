import { Schema } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SupportLogSchema } from "../../src/internal/schema/support-log.js";
import {
  createSupportHandler,
  type RecordingStorage,
  type SupportHandlerConfig,
} from "../../src/server.js";
import { submission } from "./fixtures.js";

const fetchStub = vi.fn<typeof fetch>();
const storage = {
  name: "test-storage",
  createUpload: vi.fn<RecordingStorage["createUpload"]>(),
  resolveUpload: vi.fn<RecordingStorage["resolveUpload"]>(),
};
const handler = (
  overrides: Partial<SupportHandlerConfig> = {},
  recording = true,
) =>
  createSupportHandler({
    delivery: {
      webhook: { url: "https://receiver.example.com/logs", secret: "secret" },
    },
    authorize: () => true,
    rateLimit: false,
    ...(recording ? { recording: { storage } } : {}),
    ...overrides,
  });
const part = {
  ticket: "ticket-1",
  width: 1280,
  height: 800,
  durationMs: 42_000,
  size: 1_000_000,
  mimeType: "video/webm;codecs=vp9,opus",
};
const uploadRequest = (body: unknown) =>
  new Request("https://app.example.com/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function submit(log: unknown = submission(), recording: unknown = part) {
  const form = new FormData();
  form.set("supportLog", JSON.stringify(log));
  if (recording !== null) form.set("recording", JSON.stringify(recording));
  return new Request("https://app.example.com/support", {
    method: "POST",
    body: form,
  });
}
const delivered = () =>
  JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body)) as unknown;

beforeEach(() => {
  fetchStub
    .mockReset()
    .mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchStub);
  storage.createUpload.mockReset().mockResolvedValue({
    target: {
      _tag: "Put",
      url: "https://bucket.example.com/r?sig=1",
      headers: { "content-type": "video/webm" },
    },
    ticket: "ticket-1",
  });
  storage.resolveUpload.mockReset().mockResolvedValue({
    url: "https://files.example.com/r.webm",
    key: "r.webm",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("offers recording limits only when recording storage is configured", async () => {
  const on = await handler({ recording: { storage, maxSeconds: 120 } })(
    new Request("https://app.example.com/support"),
  );
  expect(await on.json()).toEqual({
    recording: { maxSeconds: 120, maxBytes: 200 * 1024 * 1024 },
  });
  const off = await handler(
    {},
    false,
  )(new Request("https://app.example.com/support"));
  expect(await off.json()).toEqual({});
});

test("authorizes a recording upload, then returns storage's target and ticket", async () => {
  const authorize = vi.fn(() => true);
  const id = submission().id;
  const response = await handler({ authorize })(
    uploadRequest({
      recordingUpload: { id, size: 5000, mimeType: "video/webm;codecs=vp9" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    target: {
      _tag: "Put",
      url: "https://bucket.example.com/r?sig=1",
      headers: { "content-type": "video/webm" },
    },
    ticket: "ticket-1",
  });
  expect(authorize).toHaveBeenCalledOnce();
  expect(storage.createUpload).toHaveBeenCalledWith(
    expect.objectContaining({
      id,
      filename: `support-log-${id}.webm`,
      size: 5000,
      mimeType: "video/webm;codecs=vp9",
    }),
  );
});

test("refuses recording uploads that are off, oversized, malformed or unauthorized", async () => {
  const id = submission().id;
  const body = { recordingUpload: { id, size: 5000, mimeType: "video/webm" } };
  const off = await handler({}, false)(uploadRequest(body));
  expect(off.status).toBe(400);
  const large = await handler({ recording: { storage, maxBytes: 4000 } })(
    uploadRequest(body),
  );
  expect(large.status).toBe(413);
  const notVideo = await handler()(
    uploadRequest({
      recordingUpload: { id, size: 5000, mimeType: "text/html" },
    }),
  );
  expect(notVideo.status).toBe(400);
  const denied = await handler({ authorize: () => false })(uploadRequest(body));
  expect(denied.status).toBe(403);
  expect(storage.createUpload).not.toHaveBeenCalled();
});

test("hides storage failures behind UploadFailed", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  storage.createUpload.mockRejectedValue(new Error("bucket credentials: xyz"));
  const response = await handler()(
    uploadRequest({
      recordingUpload: {
        id: submission().id,
        size: 5000,
        mimeType: "video/webm",
      },
    }),
  );
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain("UploadFailed");
  expect(body).not.toContain("xyz");
  expect(error).toHaveBeenCalled();
});

test("attaches a resolved recording to a schema-valid v2 Support Log", async () => {
  const response = await handler()(submit());
  expect(response.status).toBe(200);
  expect(storage.resolveUpload).toHaveBeenCalledWith(
    "ticket-1",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  const log = delivered();
  expect(Schema.is(SupportLogSchema)(log)).toBe(true);
  expect(log).toMatchObject({
    schemaVersion: 2,
    recording: {
      url: "https://files.example.com/r.webm",
      key: "r.webm",
      width: 1280,
      height: 800,
      durationMs: 42_000,
      size: 1_000_000,
      mimeType: "video/webm;codecs=vp9,opus",
    },
  });
});

test("accepts v1 submissions from widgets built before recordings, delivering v2", async () => {
  const response = await handler()(
    submit({ ...submission(), schemaVersion: 1 }, null),
  );
  expect(response.status).toBe(200);
  expect(delivered()).toMatchObject({ schemaVersion: 2 });
  expect(delivered()).not.toHaveProperty("recording");
});

test("delivers nothing when a recording can't be verified or breaks the limits", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage.resolveUpload.mockRejectedValue(new Error("forged ticket"));
  expect((await handler()(submit())).status).toBe(502);
  storage.resolveUpload.mockResolvedValue({
    url: "javascript:alert(1)",
    key: "k",
  });
  expect((await handler()(submit(submission(2)))).status).toBe(502);
  const tooLong = await handler({ recording: { storage, maxSeconds: 30 } })(
    submit(submission(3)),
  );
  expect(tooLong.status).toBe(400);
  const off = await handler({}, false)(submit(submission(4)));
  expect(off.status).toBe(400);
  const malformed = await handler()(
    submit(submission(5), { ...part, ticket: "" }),
  );
  expect(malformed.status).toBe(400);
  expect(fetchStub).not.toHaveBeenCalled();
});

test("rejects invalid recording limits at creation", () => {
  expect(() => handler({ recording: { storage, maxSeconds: 0 } })).toThrow(
    TypeError,
  );
  expect(() => handler({ recording: { storage, maxBytes: -1 } })).toThrow(
    TypeError,
  );
});
