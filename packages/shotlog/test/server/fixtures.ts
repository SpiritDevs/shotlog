import { getShortId } from "../../src/short-id.js";
import type { SupportLogSubmission } from "../../src/types.js";

export const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII=",
    "base64",
  ),
);

export function submission(sequence = 1): SupportLogSubmission {
  const id = `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  return {
    schemaVersion: 1,
    id,
    shortId: getShortId(id),
    createdAt: "2026-09-28T12:00:00.000Z",
    type: "Bug",
    description: "Saving the address did not work.",
    environment: {
      url: "https://example.com/settings",
      route: "/settings",
      title: "Settings",
      referrer: "",
      timeOnPageMs: 3000,
      userAgent: "test-browser",
      browser: "Firefox",
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
  };
}

export function request(
  log: unknown = submission(),
  screenshot?: Blob,
  headers?: HeadersInit,
): Request {
  const form = new FormData();
  form.set("supportLog", JSON.stringify(log));
  if (screenshot) form.set("screenshot", screenshot, "screenshot.png");
  return new Request("https://app.example.com/support", {
    method: "POST",
    body: form,
    ...(headers ? { headers } : {}),
  });
}
