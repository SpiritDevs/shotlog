import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  SupportLogSchema,
  SupportLogSubmissionSchema,
} from "../src/internal/schema/support-log.js";
import type { SupportLog } from "../src/types.js";

const log = {
  schemaVersion: 1,
  id: "00000000-0000-4000-8000-000000000001",
  shortId: "SL-0001",
  createdAt: "2026-09-28T12:00:00.000Z",
  type: "Billing",
  description: "I tried to save the new address.",
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
    colorScheme: "dark",
    online: true,
    libraryVersion: "0.0.0",
  },
} satisfies SupportLog;
const decode = Schema.decodeUnknownSync(SupportLogSchema);
const isLog = Schema.is(SupportLogSchema);

test("preserves arbitrary JSON Host Context while rejecting non-JSON values and unexpected fields", () => {
  const input = {
    ...log,
    reporter: {
      id: "user-42",
      plan: "pro",
      teams: ["support"],
      preferences: { email: false },
    },
    metadata: { featureFlags: { beta: true }, session: null },
  };
  expect(decode(input)).toEqual(input);
  expect(Schema.decodeUnknownSync(SupportLogSubmissionSchema)(input)).toEqual(
    input,
  );
  for (const invalid of [
    { ...log, reporter: { email: 42 } },
    { ...log, metadata: { value: undefined } },
    { ...log, metadata: { value: Infinity } },
    { ...log, extra: true },
    { ...log, environment: { ...log.environment, extra: true } },
  ])
    expect(isLog(invalid)).toBe(false);
});

test("rejects invalid identity, timestamps, and Description/Type lengths", () => {
  for (const fields of [
    { id: "not-a-uuid" },
    { shortId: "SL-0002" },
    { shortId: "SL-OOOO" },
    { createdAt: "2026-02-30T12:00:00.000Z" },
    { createdAt: "2026-09-28" },
    { description: "" },
    { description: "x".repeat(10_001) },
    { type: "" },
    { type: "x".repeat(41) },
  ])
    expect(
      isLog({ ...log, ...fields }),
      JSON.stringify(fields).slice(0, 100),
    ).toBe(false);
  expect(
    isLog({ ...log, description: "x".repeat(10_000), type: "x".repeat(40) }),
  ).toBe(true);
});

test.each(["reporter", "metadata"])(
  "caps %s by serialized UTF-8 bytes, including keys",
  (field) => {
    const atLimit = { value: "é".repeat(8186) };
    expect(isLog({ ...log, [field]: atLimit })).toBe(true);
    expect(isLog({ ...log, [field]: { value: `${atLimit.value}x` } })).toBe(
      false,
    );
    expect(isLog({ ...log, [field]: { ["x".repeat(16_384)]: null } })).toBe(
      false,
    );
  },
);

test("validates both Screenshot variants and keeps Screenshots out of the multipart JSON part", () => {
  const fields = { width: 2, height: 2, size: 4, mimeType: "image/png" };
  for (const screenshot of [
    {
      ...fields,
      _tag: "Inline",
      data: "cG5n",
      uploadError: "Upload timed out",
    },
    {
      ...fields,
      _tag: "Uploaded",
      url: "https://example.com/image.png",
      key: "image",
    },
  ]) {
    expect(decode({ ...log, screenshot }).screenshot).toEqual(screenshot);
    expect(Schema.is(SupportLogSubmissionSchema)({ ...log, screenshot })).toBe(
      false,
    );
  }
  for (const screenshot of [
    { ...fields, _tag: "Inline", data: "not base64!" },
    { ...fields, _tag: "Uploaded", url: "https://example.com/image.png" },
    { ...fields, _tag: "Inline", data: "cG5n", width: 0 },
  ])
    expect(isLog({ ...log, screenshot })).toBe(false);
});

test("bounds the Diagnostic Trail and accepts status zero for network errors", () => {
  const entry = {
    level: "warn",
    message: "x".repeat(2000),
    stack: "x".repeat(4000),
    at: log.createdAt,
  };
  const network = {
    method: "POST",
    url: "https://example.com/save",
    status: 0,
    at: log.createdAt,
  };
  const diagnostics = {
    console: Array.from({ length: 50 }, () => entry),
    network: Array.from({ length: 50 }, () => network),
  };
  expect(isLog({ ...log, diagnostics })).toBe(true);
  for (const invalid of [
    { ...diagnostics, console: [...diagnostics.console, entry] },
    { ...diagnostics, network: [...diagnostics.network, network] },
    { ...diagnostics, console: [{ ...entry, message: "x".repeat(2001) }] },
    { ...diagnostics, console: [{ ...entry, stack: "x".repeat(4001) }] },
    { ...diagnostics, network: [{ ...network, status: -1 }] },
  ])
    expect(isLog({ ...log, diagnostics: invalid })).toBe(false);
});
