import { Effect } from "effect";
import { UploadFailed } from "../internal/errors.js";
import type { Screenshot } from "../types.js";
import { inlineScreenshot, type ParsedScreenshot } from "./multipart.js";
import type { StorageAdapter } from "./storage-types.js";

export function uploadScreenshot(
  storage: StorageAdapter,
  id: string,
  screenshot: ParsedScreenshot,
): Effect.Effect<Screenshot> {
  return Effect.tryPromise({
    try: (signal) =>
      storage.upload(screenshot.bytes, {
        id,
        filename: `support-log-${id}.png`,
        signal,
      }),
    catch: () => new UploadFailed({ message: "Screenshot upload failed" }),
  }).pipe(
    Effect.timeoutFail({
      duration: 30_000,
      onTimeout: () =>
        new UploadFailed({ message: "Screenshot upload timed out" }),
    }),
    Effect.map(
      ({ url, key }): Screenshot => ({
        _tag: "Uploaded",
        url,
        key,
        width: screenshot.width,
        height: screenshot.height,
        size: screenshot.bytes.length,
        mimeType: "image/png",
      }),
    ),
    Effect.catchAll((error) =>
      Effect.sync(() => ({
        ...inlineScreenshot(screenshot),
        uploadError: error.message,
      })),
    ),
  );
}
