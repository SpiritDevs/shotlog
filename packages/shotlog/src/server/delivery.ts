import { Context, type Effect } from "effect";
import type { DeliveryFailed } from "../internal/errors.js";
import type { SupportLogSubmission } from "../types.js";
import type { ParsedScreenshot } from "./multipart.js";

export class Delivery extends Context.Tag("shotlog/Delivery")<
  Delivery,
  {
    readonly deliver: (
      log: SupportLogSubmission,
      screenshot?: ParsedScreenshot,
      /** Per-report routing; only Slack reads it. */
      target?: { readonly slackChannel?: string },
    ) => Effect.Effect<void, DeliveryFailed>;
  }
>() {}
