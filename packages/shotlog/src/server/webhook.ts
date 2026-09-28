import { Context, Effect, Layer, Schedule } from "effect";
import { DeliveryFailed } from "../internal/errors.js";
import type { SupportLog } from "../types.js";
import type { WebhookConfig } from "./config.js";
import { signWebhook } from "./signature.js";

export class Delivery extends Context.Tag("shotlog/Delivery")<
  Delivery,
  { readonly deliver: (log: SupportLog) => Effect.Effect<void, DeliveryFailed> }
>() {}

export function webhookLayer(config: WebhookConfig) {
  return Layer.succeed(Delivery, {
    deliver: Effect.fn("deliverWebhook")(function* (log: SupportLog) {
      const body = JSON.stringify(log);
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
