import { Offline, ValidationFailed } from "../errors.js";
import {
  Field,
  fromWire,
  type SubmitErrorBody,
  type SubmitSuccessBody,
} from "../internal/wire.js";
import type { SupportLogSubmission } from "../types.js";
import type { ShotlogSubmitResult } from "./types.js";

export async function submitReport(
  endpoint: string,
  log: SupportLogSubmission,
): Promise<ShotlogSubmitResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new Offline();
  const form = new FormData();
  try {
    form.append(
      Field.supportLog,
      new Blob([JSON.stringify(log)], { type: "application/json" }),
    );
  } catch (cause) {
    throw new ValidationFailed(
      ["Host Context must be serializable as JSON"],
      undefined,
      { cause },
    );
  }
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body: form });
  } catch (cause) {
    throw new Offline(undefined, { cause });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (cause instanceof TypeError) throw new Offline(undefined, { cause });
    throw new ValidationFailed(
      ["Relay Endpoint returned invalid JSON"],
      undefined,
      { cause },
    );
  }
  if (isErrorBody(body)) throw fromWire(body.error);
  if (
    response.ok &&
    isSuccessBody(body) &&
    body.id === log.id &&
    body.shortId === log.shortId
  ) {
    return { id: body.id, shortId: body.shortId, duplicate: body.duplicate };
  }
  throw new ValidationFailed([
    "Relay Endpoint returned an invalid submission response",
  ]);
}

function isSuccessBody(body: unknown): body is SubmitSuccessBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    body.ok === true &&
    "id" in body &&
    typeof body.id === "string" &&
    "shortId" in body &&
    typeof body.shortId === "string" &&
    "duplicate" in body &&
    typeof body.duplicate === "boolean"
  );
}

function isErrorBody(body: unknown): body is SubmitErrorBody {
  if (
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== false ||
    !("error" in body)
  )
    return false;
  const error = body.error;
  if (
    typeof error !== "object" ||
    error === null ||
    !("_tag" in error) ||
    !("message" in error) ||
    typeof error.message !== "string"
  )
    return false;
  switch (error._tag) {
    case "Unauthorized":
    case "Forbidden":
    case "UploadFailed":
      return true;
    case "RateLimited":
      return (
        "retryAfterSeconds" in error &&
        typeof error.retryAfterSeconds === "number" &&
        Number.isFinite(error.retryAfterSeconds) &&
        error.retryAfterSeconds >= 0
      );
    case "PayloadTooLarge":
      return (
        "limitBytes" in error &&
        typeof error.limitBytes === "number" &&
        Number.isFinite(error.limitBytes) &&
        error.limitBytes >= 0
      );
    case "ValidationFailed":
      return (
        "issues" in error &&
        Array.isArray(error.issues) &&
        error.issues.every((issue: unknown) => typeof issue === "string")
      );
    case "DeliveryFailed":
      return (
        "channel" in error &&
        (error.channel === "email" || error.channel === "webhook")
      );
    default:
      return false;
  }
}
