import { Offline, ValidationFailed } from "../errors.js";
import {
  Field,
  fromWire,
  type SlackChannelOption,
  type SubmitErrorBody,
  type SubmitSuccessBody,
} from "../internal/wire.js";
import type { SupportLogSubmission } from "../types.js";
import type { ShotlogSubmitResult } from "./types.js";

/**
 * Covers sending and reading the response: 10 s storage + three 10 s webhook
 * attempts and backoff, with Email in parallel, fit within the 60 s client budget.
 */
const deadlineMs = 60_000;

export async function submitReport(
  endpoint: string,
  log: SupportLogSubmission,
  screenshot?: Blob,
  slackChannel?: string,
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
  if (screenshot) form.append(Field.screenshot, screenshot, "screenshot.png");
  if (slackChannel !== undefined) form.append(Field.slackChannel, slackChannel);
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, { method: "POST", body: form, signal });
    } catch (cause) {
      throw new Offline(undefined, { cause });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      if (cause instanceof TypeError || signal.aborted)
        throw new Offline(undefined, { cause });
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
  } finally {
    clearTimeout(timer);
  }
}

export interface SlackChoice {
  readonly channels: readonly SlackChannelOption[];
  /** Types the server always routes to their own channel; no dropdown for them. */
  readonly fixedTypes: readonly string[];
}

/**
 * Asks the Relay Endpoint which Slack channels to offer. Null means none to choose, including
 * from Relay Endpoints that predate the GET route; a throw means ask again next time.
 */
export async function loadSlackChoice(
  endpoint: string,
): Promise<SlackChoice | null> {
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 405) return null;
  if (!response.ok) throw new Error(`Relay options failed: ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("slackChannels" in body))
    return null;
  const channels = body.slackChannels;
  const fixedTypes =
    "slackFixedTypes" in body ? body.slackFixedTypes : ([] as unknown[]);
  if (
    !Array.isArray(channels) ||
    !channels.every(
      (channel: unknown) =>
        typeof channel === "object" &&
        channel !== null &&
        "id" in channel &&
        typeof channel.id === "string" &&
        "name" in channel &&
        typeof channel.name === "string",
    ) ||
    !Array.isArray(fixedTypes) ||
    !fixedTypes.every((type: unknown) => typeof type === "string")
  )
    throw new Error("Relay options are invalid");
  return {
    channels: channels as readonly SlackChannelOption[],
    fixedTypes: fixedTypes as readonly string[],
  };
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
        (error.channel === "email" ||
          error.channel === "webhook" ||
          error.channel === "slack" ||
          error.channel === "custom")
      );
    default:
      return false;
  }
}
