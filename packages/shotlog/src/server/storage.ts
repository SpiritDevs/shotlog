import { Effect, Schema } from "effect";
import { UploadFailed } from "../internal/errors.js";
import { ScreenshotSchema } from "../internal/schema/support-log.js";
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
      duration: 10_000,
      onTimeout: () =>
        new UploadFailed({ message: "Screenshot upload timed out" }),
    }),
    Effect.flatMap(({ url, key }) => {
      const uploaded: Screenshot = {
        _tag: "Uploaded",
        url,
        key,
        width: screenshot.width,
        height: screenshot.height,
        size: screenshot.bytes.length,
        mimeType: "image/png",
      };
      return Schema.is(ScreenshotSchema)(uploaded)
        ? Effect.succeed(uploaded)
        : Effect.fail(
            new UploadFailed({
              message: "Storage adapter returned an invalid result",
            }),
          );
    }),
    Effect.catchAll((error) =>
      Effect.sync(() => ({
        ...inlineScreenshot(screenshot),
        uploadError: error.message,
      })),
    ),
  );
}
