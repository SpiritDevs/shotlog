import { Cause, Effect, Exit, Option } from "effect";
import * as Public from "../errors.js";
import type { InternalError } from "./errors.js";

function toPublicError(error: InternalError): Public.ShotlogError {
  const message = error.message || undefined;
  const options = { cause: error.cause };
  switch (error._tag) {
    case "Unauthorized":
      return new Public.Unauthorized(message, options);
    case "Forbidden":
      return new Public.Forbidden(message, options);
    case "RateLimited":
      return new Public.RateLimited(error.retryAfterSeconds, message, options);
    case "PayloadTooLarge":
      return new Public.PayloadTooLarge(error.limitBytes, message, options);
    case "ValidationFailed":
      return new Public.ValidationFailed(error.issues, message, options);
    case "DeliveryFailed":
      return new Public.DeliveryFailed(error.channel, message, options);
    case "UploadFailed":
      return new Public.UploadFailed(message, options);
    case "Offline":
      return new Public.Offline(message, options);
    case "ProviderNotInstalled":
      return new Public.ProviderNotInstalled(
        error.packageName,
        message,
        options,
      );
    case "UnsupportedRuntime":
      return new Public.UnsupportedRuntime(message, options);
    default:
      throw error satisfies never;
  }
}

/** Runs an Effect at a public boundary: typed failures become public errors, defects are rethrown as-is. */
export async function runPublic<A>(
  effect: Effect.Effect<A, InternalError>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.failureOption(exit.cause);
  throw Option.isSome(failure)
    ? toPublicError(failure.value)
    : Cause.squash(exit.cause);
}
