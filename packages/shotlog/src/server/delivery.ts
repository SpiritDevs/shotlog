import { Context, type Effect } from "effect";
import type { DeliveryFailed } from "../internal/errors.js";
import type { SupportLog } from "../types.js";
import type { ParsedScreenshot } from "./multipart.js";

/** What every channel delivers; the Screenshot travels separately as PNG bytes. */
export type DeliveredLog = Omit<SupportLog, "screenshot">;

export class Delivery extends Context.Tag("shotlog/Delivery")<
  Delivery,
  {
    readonly deliver: (
      log: DeliveredLog,
      screenshot?: ParsedScreenshot,
      /** Per-report routing; only Slack reads it. */
      target?: { readonly slackChannel?: string },
    ) => Effect.Effect<void, DeliveryFailed>;
  }
>() {}
