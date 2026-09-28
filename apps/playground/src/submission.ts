import type { SupportLogSubmission } from "shotlog";
import { getShortId } from "shotlog/server";
import { metadata, reporter } from "./context.js";

export function buildSubmission(sequence: number): FormData {
  const id = crypto.randomUUID();
  const log: SupportLogSubmission = {
    schemaVersion: 1,
    id,
    shortId: getShortId(id),
    createdAt: new Date().toISOString(),
    type: "Bug",
    description: `Playground burst submission ${sequence} of 20.`,
    reporter,
    metadata,
    environment: {
      url: location.href,
      route: location.pathname + location.hash,
      title: document.title,
      referrer: document.referrer,
      timeOnPageMs: Math.floor(performance.now()),
      userAgent: navigator.userAgent,
      browser: "Playground burst",
      os: "unknown",
      deviceType: "unknown",
      language: navigator.language || "en",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      screen: {
        width: Math.max(1, screen.width),
        height: Math.max(1, screen.height),
      },
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      colorScheme: matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
      online: navigator.onLine,
      libraryVersion: "0.0.0",
    },
  };
  const form = new FormData();
  form.set(
    "supportLog",
    new Blob([JSON.stringify(log)], { type: "application/json" }),
    "support-log.json",
  );
  return form;
}
