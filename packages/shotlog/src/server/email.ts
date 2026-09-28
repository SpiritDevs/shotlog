import { Effect, Layer } from "effect";
import * as Public from "../errors.js";
import { DeliveryFailed } from "../internal/errors.js";
import type { SupportLogSubmission } from "../types.js";
import type { EmailConfig } from "./config.js";
import { Delivery } from "./delivery.js";
import { renderEmail } from "./email-template.js";
import type { ParsedScreenshot } from "./multipart.js";

export const emailTimeoutMs = 15_000;

export function emailLayer(config: EmailConfig) {
  return Layer.succeed(Delivery, {
    deliver: Effect.fn("deliverEmail")(function* (
      log: SupportLogSubmission,
      screenshot?: ParsedScreenshot,
    ) {
      const message = renderEmail(config, log, screenshot);
      yield* Effect.tryPromise({
        try: () => config.provider.send(message),
        catch: (cause) => {
          if (
            cause instanceof Public.ProviderNotInstalled ||
            cause instanceof Public.UnsupportedRuntime
          ) {
            console.error("shotlog: email provider misconfiguration", cause);
          }
          return new DeliveryFailed({ channel: "email", cause });
        },
      }).pipe(
        Effect.timeoutFail({
          duration: emailTimeoutMs,
          onTimeout: () => new DeliveryFailed({ channel: "email" }),
        }),
      );
    }),
  });
}
