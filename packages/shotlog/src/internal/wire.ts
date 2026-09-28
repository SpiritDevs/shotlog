import * as Public from "../errors.js";

/** Multipart field names for a submission to the Relay Endpoint. */
export const Field = {
  supportLog: "supportLog",
  screenshot: "screenshot",
} as const;

/** 200 body. `duplicate` is true when this Support Log ID was already delivered. */
export interface SubmitSuccessBody {
  readonly ok: true;
  readonly id: string;
  readonly shortId: string;
  readonly duplicate: boolean;
}

/** Failures a Relay Endpoint may report to the browser. */
export type ServerError = Exclude<
  Public.ShotlogError,
  Public.Offline | Public.ProviderNotInstalled | Public.UnsupportedRuntime
>;

/** Error body. Only failures a browser can act on cross the wire. */
export type SubmitErrorBody = {
  readonly ok: false;
  readonly error:
    | { readonly _tag: "Unauthorized"; readonly message: string }
    | { readonly _tag: "Forbidden"; readonly message: string }
    | {
        readonly _tag: "RateLimited";
        readonly message: string;
        readonly retryAfterSeconds: number;
      }
    | {
        readonly _tag: "PayloadTooLarge";
        readonly message: string;
        readonly limitBytes: number;
      }
    | {
        readonly _tag: "ValidationFailed";
        readonly message: string;
        readonly issues: readonly string[];
      }
    | {
        readonly _tag: "DeliveryFailed";
        readonly message: string;
        readonly channel: "email" | "webhook";
      }
    | { readonly _tag: "UploadFailed"; readonly message: string };
};

const status: Record<ServerError["_tag"], number> = {
  Unauthorized: 401,
  Forbidden: 403,
  RateLimited: 429,
  PayloadTooLarge: 413,
  ValidationFailed: 400,
  DeliveryFailed: 502,
  UploadFailed: 502,
};

/**
 * Server side: encode an error as a JSON Response. Misconfiguration errors
 * (ProviderNotInstalled, UnsupportedRuntime) must be logged and converted to
 * DeliveryFailed by the caller, so internals never reach the browser.
 */
export function errorResponse(wire: ServerError): Response {
  const body: SubmitErrorBody = { ok: false, error: toWire(wire) };
  const headers = new Headers({ "content-type": "application/json" });
  if (wire._tag === "RateLimited")
    headers.set("retry-after", String(wire.retryAfterSeconds));
  return new Response(JSON.stringify(body), {
    status: status[wire._tag],
    headers,
  });
}

function toWire(error: ServerError): SubmitErrorBody["error"] {
  switch (error._tag) {
    case "RateLimited":
      return {
        _tag: error._tag,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    case "PayloadTooLarge":
      return {
        _tag: error._tag,
        message: error.message,
        limitBytes: error.limitBytes,
      };
    case "ValidationFailed":
      return { _tag: error._tag, message: error.message, issues: error.issues };
    case "DeliveryFailed":
      return {
        _tag: error._tag,
        message: error.message,
        channel: error.channel,
      };
    default:
      return { _tag: error._tag, message: error.message };
  }
}

/** Client side: turn an error body back into the matching public error class. */
export function fromWire(error: SubmitErrorBody["error"]): Public.ShotlogError {
  switch (error._tag) {
    case "Unauthorized":
      return new Public.Unauthorized(error.message);
    case "Forbidden":
      return new Public.Forbidden(error.message);
    case "RateLimited":
      return new Public.RateLimited(error.retryAfterSeconds, error.message);
    case "PayloadTooLarge":
      return new Public.PayloadTooLarge(error.limitBytes, error.message);
    case "ValidationFailed":
      return new Public.ValidationFailed(error.issues, error.message);
    case "DeliveryFailed":
      return new Public.DeliveryFailed(error.channel, error.message);
    case "UploadFailed":
      return new Public.UploadFailed(error.message);
  }
}
