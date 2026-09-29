import { Effect, Layer, Schedule } from "effect";
import { DeliveryFailed } from "../internal/errors.js";
import type { WebhookConfig } from "./config.js";
import { type DeliveredLog, Delivery } from "./delivery.js";
import { inlineScreenshot, type ParsedScreenshot } from "./multipart.js";
import { signWebhook } from "./signature.js";
import { uploadScreenshot } from "./storage.js";

export function webhookLayer(config: WebhookConfig) {
  return Layer.succeed(Delivery, {
    deliver: Effect.fn("deliverWebhook")(function* (
      log: DeliveredLog,
      screenshot?: ParsedScreenshot,
    ) {
      // Prepared once after the handler's dedupe check, outside webhook retries.
      const image = screenshot
        ? config.screenshotMode === "upload" && config.storage
          ? yield* uploadScreenshot(config.storage, log.id, screenshot)
          : inlineScreenshot(screenshot)
        : undefined;
      const body = JSON.stringify(image ? { ...log, screenshot: image } : log);
      const attempt = Effect.gen(function* () {
        const signature = yield* signWebhook(body, config.secret);
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            fetch(config.url, {
              method: "POST",
              redirect: "manual",
              signal,
              headers: {
                "content-type": "application/json",
                "x-shotlog-id": log.id,
                "x-shotlog-signature": signature,
              },
              body,
            }),
          catch: (cause) => new DeliveryFailed({ channel: "webhook", cause }),
        });
        yield* Effect.tryPromise(async () => {
          await response.body?.cancel();
        }).pipe(Effect.ignore);
        if (response.status >= 500)
          return yield* new DeliveryFailed({ channel: "webhook" });
        return response.ok;
      }).pipe(
        Effect.timeout(config.timeoutMs ?? 10_000),
        Effect.catchTag("TimeoutException", (cause) =>
          Effect.fail(new DeliveryFailed({ channel: "webhook", cause })),
        ),
      );
      const delivered = yield* attempt.pipe(
        Effect.retry(
          Schedule.exponential("200 millis").pipe(
            Schedule.intersect(Schedule.recurs(2)),
          ),
        ),
      );
      if (!delivered) return yield* new DeliveryFailed({ channel: "webhook" });
    }),
  });
}
