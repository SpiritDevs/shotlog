import { Data } from "effect";

type Details = { readonly message?: string; readonly cause?: unknown };

export class Unauthorized extends Data.TaggedError("Unauthorized")<Details> {}
export class Forbidden extends Data.TaggedError("Forbidden")<Details> {}
export class RateLimited extends Data.TaggedError("RateLimited")<
  Details & { readonly retryAfterSeconds: number }
> {}
export class PayloadTooLarge extends Data.TaggedError("PayloadTooLarge")<
  Details & { readonly limitBytes: number }
> {}
export class ValidationFailed extends Data.TaggedError("ValidationFailed")<
  Details & { readonly issues: readonly string[] }
> {}
export class DeliveryFailed extends Data.TaggedError("DeliveryFailed")<
  Details & { readonly channel: "email" | "webhook" | "slack" }
> {}
export class UploadFailed extends Data.TaggedError("UploadFailed")<Details> {}
export class Offline extends Data.TaggedError("Offline")<Details> {}
export class ProviderNotInstalled extends Data.TaggedError(
  "ProviderNotInstalled",
)<Details & { readonly packageName: string }> {}
export class UnsupportedRuntime extends Data.TaggedError(
  "UnsupportedRuntime",
)<Details> {}

export type InternalError =
  | Unauthorized
  | Forbidden
  | RateLimited
  | PayloadTooLarge
  | ValidationFailed
  | DeliveryFailed
  | UploadFailed
  | Offline
  | ProviderNotInstalled
  | UnsupportedRuntime;
