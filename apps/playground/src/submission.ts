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

/** Real PNG noise, deliberately larger than the relay's default 5 MiB limit. */
export async function buildOversizedSubmission(): Promise<FormData> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1536;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const pixels = context.createImageData(canvas.width, canvas.height);
  let seed = 123456789;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    pixels.data[i] = seed & 255;
    pixels.data[i + 1] = (seed >>> 8) & 255;
    pixels.data[i + 2] = (seed >>> 16) & 255;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const screenshot = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode PNG"));
    }, "image/png");
  });
  if (screenshot.size <= 5 * 1024 * 1024)
    throw new Error("Generated PNG did not exceed 5 MiB");
  const form = buildSubmission(1);
  form.set("screenshot", screenshot, "oversized.png");
  return form;
}
