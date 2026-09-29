import { afterEach, expect, test, vi } from "vitest";
import { submitReport } from "../../src/client/submit.js";
import {
  DeliveryFailed,
  Forbidden,
  Offline,
  PayloadTooLarge,
  RateLimited,
  Unauthorized,
  UploadFailed,
  ValidationFailed,
} from "../../src/errors.js";
import { Field, type SubmitErrorBody } from "../../src/internal/wire.js";
import type { SupportLogSubmission } from "../../src/types.js";

const log: SupportLogSubmission = {
  schemaVersion: 2,
  id: "00000000-0000-4000-8000-000000000001",
  shortId: "SL-0001",
  createdAt: "2026-09-28T12:00:00.000Z",
  type: "Bug",
  description: "Save did not work.",
  environment: {
    url: "https://example.com/settings",
    route: "/settings",
    title: "Settings",
    referrer: "",
    timeOnPageMs: 3000,
    userAgent: "test-browser",
    browser: "Firefox 143",
    os: "macOS",
    deviceType: "desktop",
    language: "en-AU",
    timezone: "Australia/Sydney",
    screen: { width: 1440, height: 900 },
    viewport: { width: 1000, height: 700 },
    devicePixelRatio: 2,
    colorScheme: "light",
    online: true,
    libraryVersion: "0.0.0",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("maps wire failures to public error instances and sends the contracted JSON part", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const errors = [
    new Unauthorized(),
    new Forbidden(),
    new RateLimited(125),
    new PayloadTooLarge(100),
    new ValidationFailed(["description is required"]),
    new DeliveryFailed("webhook"),
    new UploadFailed(),
  ];
  for (const expected of errors) {
    const error: SubmitErrorBody["error"] = {
      ...expected,
      message: expected.message,
    };
    const request = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.method).toBe("POST");
      expect(options.headers).toBeUndefined();
      const form = options.body as FormData;
      const fields: string[] = [];
      form.forEach((_value, key) => {
        fields.push(key);
      });
      expect(fields).toEqual([Field.supportLog]);
      const part = form.get(Field.supportLog) as Blob;
      expect(part.type).toBe("application/json");
      expect(JSON.parse(await part.text())).toEqual(log);
      return Response.json({ ok: false, error } satisfies SubmitErrorBody, {
        status: 400,
      });
    });
    vi.stubGlobal("fetch", request);
    const result = await submitReport("/api/support", log).catch(
      (error: unknown) => error,
    );
    expect(result).toBeInstanceOf(expected.constructor);
    expect(result).toMatchObject(error);
    expect(request).toHaveBeenCalledOnce();
  }
});

test("maps network failure to Offline and avoids fetch when already offline", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const failure = new TypeError("Failed to fetch");
  const request = vi.fn().mockRejectedValue(failure);
  vi.stubGlobal("fetch", request);
  await expect(submitReport("/api/support", log)).rejects.toMatchObject({
    _tag: "Offline",
    cause: failure,
  });
  vi.stubGlobal("navigator", { onLine: false });
  await expect(submitReport("/api/support", log)).rejects.toBeInstanceOf(
    Offline,
  );
  expect(request).toHaveBeenCalledOnce();
});

test("the 60-second request budget includes reading the response and clears its timer", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener(
              "abort",
              () => controller.error(signal?.reason),
              { once: true },
            );
          },
        }),
      );
    }),
  );
  const result = submitReport("/api/support", log).catch(
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(59_000);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await result).toBeInstanceOf(Offline);
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ok: true,
        id: log.id,
        shortId: log.shortId,
        duplicate: false,
      }),
    ),
  );
  await submitReport("/api/support", log);
  expect(vi.getTimerCount()).toBe(0);
});

test("reads what the Relay Endpoint offers, including Screen Recording limits", async () => {
  const { loadRelayOptions } = await import("../../src/client/submit.js");
  const reply = (body: unknown, status = 200) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body, { status })),
    );
  reply({ recording: { maxSeconds: 300, maxBytes: 1000 } });
  expect(await loadRelayOptions("/api/support")).toEqual({
    slack: null,
    recording: { maxSeconds: 300, maxBytes: 1000 },
  });
  reply({});
  expect(await loadRelayOptions("/api/support")).toEqual({
    slack: null,
    recording: null,
  });
  reply(null, 405);
  expect(await loadRelayOptions("/api/support")).toEqual({
    slack: null,
    recording: null,
  });
  reply({ recording: { maxSeconds: "300" } });
  await expect(loadRelayOptions("/api/support")).rejects.toThrow();
});

test("asks for a recording upload and sends its ticket with the report", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const { requestRecordingUpload } = await import("../../src/client/submit.js");
  const target = { _tag: "Put", url: "https://bucket.example.com/r" };
  const request = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ ok: true, target, ticket: "t" }),
  );
  vi.stubGlobal("fetch", request);
  const upload = { id: log.id, size: 10, mimeType: "video/webm" };
  expect(await requestRecordingUpload("/api/support", upload)).toEqual({
    ok: true,
    target,
    ticket: "t",
  });
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
    recordingUpload: upload,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { ok: false, error: { _tag: "UploadFailed", message: "x" } },
        { status: 502 },
      ),
    ),
  );
  await expect(
    requestRecordingUpload("/api/support", upload),
  ).rejects.toBeInstanceOf(UploadFailed);

  const part = {
    ticket: "t",
    width: 10,
    height: 10,
    durationMs: 1000,
    size: 10,
    mimeType: "video/webm",
  };
  const submitted = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({
      ok: true,
      id: log.id,
      shortId: log.shortId,
      duplicate: false,
    }),
  );
  vi.stubGlobal("fetch", submitted);
  await submitReport("/api/support", log, undefined, undefined, part);
  const form = submitted.mock.calls[0]?.[1]?.body as FormData;
  expect(JSON.parse(String(form.get(Field.recording)))).toEqual(part);
});
