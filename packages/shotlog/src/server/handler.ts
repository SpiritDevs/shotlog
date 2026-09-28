import { Deferred, Effect, Either } from "effect";
import * as Public from "../errors.js";
import {
  Forbidden,
  type InternalError,
  Unauthorized,
} from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import { socketAddresses } from "../internal/socket.js";
import { errorResponse, type SubmitSuccessBody } from "../internal/wire.js";
import type { SupportLogSubmission } from "../types.js";
import type { SupportHandlerConfig } from "./config.js";
import { Delivery } from "./delivery.js";
import { emailLayer } from "./email.js";
import {
  checkRequest,
  type ParsedScreenshot,
  parseSubmission,
} from "./multipart.js";
import { checkRateLimit, Store, storeLayer } from "./store.js";
import { webhookLayer } from "./webhook.js";

const authorizeRequest = Effect.fn("authorizeSupportRequest")(function* (
  request: Request,
  authorize: NonNullable<SupportHandlerConfig["authorize"]>,
) {
  const allowed = yield* Effect.tryPromise({
    try: async () => authorize(request),
    catch: (cause) => cause,
  }).pipe(
    Effect.catchAll((cause): Effect.Effect<never, Unauthorized | Forbidden> => {
      if (cause instanceof Public.Unauthorized)
        return Effect.fail(new Unauthorized({ message: cause.message }));
      if (cause instanceof Public.Forbidden)
        return Effect.fail(new Forbidden({ message: cause.message }));
      return Effect.die(cause);
    }),
  );
  if (!allowed) return yield* new Forbidden({});
  return typeof allowed === "object" ? allowed.reporterId : undefined;
});

function headerIp(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return (
    (name.toLowerCase() === "x-forwarded-for"
      ? value?.split(",").at(-1)
      : value
    )?.trim() || undefined
  );
}

function positive(name: string, value: number | undefined): void {
  if (value !== undefined && !(Number.isFinite(value) && value > 0))
    throw new TypeError(`shotlog: ${name} must be a positive finite number`);
}

function respondToFailure(
  error: unknown,
  channel: "email" | "webhook",
): Response {
  if (
    error instanceof Public.Unauthorized ||
    error instanceof Public.Forbidden ||
    error instanceof Public.RateLimited ||
    error instanceof Public.PayloadTooLarge ||
    error instanceof Public.ValidationFailed ||
    error instanceof Public.DeliveryFailed
  ) {
    return errorResponse(error);
  }
  return defectResponse(error, channel);
}

function defectResponse(
  error: unknown,
  channel: "email" | "webhook",
): Response {
  console.error("shotlog: unexpected Relay Endpoint failure", error);
  const response = errorResponse(
    new Public.DeliveryFailed(
      channel,
      "The Support Log could not be processed",
    ),
  );
  return new Response(response.body, {
    status: 500,
    headers: response.headers,
  });
}

/**
 * Create a Fetch-standard Relay Endpoint for Email and signed Webhook delivery.
 * Applies authorization, bounded multipart parsing, rate limits, and per-channel deduplication.
 * Delivered-ID records expire after 24 hours; delivery itself is not undone.
 * Delivery is at least once: a lost response, or two instances receiving the same ID at
 * the same moment, can deliver twice. Receivers should dedupe on `x-shotlog-id` / `log.id`.
 * @example
 * ```ts
 * import { createSupportHandler, type DeliveryConfig, type AuthorizeResult } from "shotlog/server";
 * function supportRoute(delivery: DeliveryConfig, authorize: (request: Request) => Promise<AuthorizeResult>) {
 *   return createSupportHandler({ delivery, authorize, ipHeader: "x-real-ip" });
 * }
 * ```
 * @public
 */
export function createSupportHandler(
  config: SupportHandlerConfig,
): (request: Request) => Promise<Response> {
  if (!config.authorize)
    console.warn(
      "shotlog: no authorize hook configured; the Relay Endpoint accepts unauthenticated reports",
    );
  positive("limits.screenshotBytes", config.limits?.screenshotBytes);
  positive("limits.concurrentRequests", config.limits?.concurrentRequests);
  if (config.rateLimit) {
    positive("rateLimit.max", config.rateLimit.max);
    positive("rateLimit.windowSeconds", config.rateLimit.windowSeconds);
  }
  positive("delivery.webhook.timeoutMs", config.delivery.webhook?.timeoutMs);
  if (
    config.delivery.webhook?.screenshotMode === "upload" &&
    !config.delivery.webhook.storage
  )
    throw new TypeError("shotlog: webhook upload mode requires storage");
  const screenshotBytes = config.limits?.screenshotBytes ?? 5 * 1024 * 1024;
  const concurrentRequests = config.limits?.concurrentRequests ?? 16;
  const clientIp = (request: Request) =>
    config.getClientIp
      ? config.getClientIp(request)
      : config.ipHeader !== undefined
        ? headerIp(request, config.ipHeader)
        : socketAddresses.get(request);
  const services = storeLayer(config.store);
  const channel = config.delivery.email ? "email" : "webhook";
  const channels = [
    ...(config.delivery.email
      ? [{ name: "email", layer: emailLayer(config.delivery.email) }]
      : []),
    ...(config.delivery.webhook
      ? [{ name: "webhook", layer: webhookLayer(config.delivery.webhook) }]
      : []),
  ];
  let warnedNoIp = false;
  const warnNoIp = () => {
    if (warnedNoIp) return;
    warnedNoIp = true;
    console.warn(
      "shotlog: could not determine the client IP; per-IP rate limiting is skipped. Configure ipHeader or getClientIp.",
    );
  };
  const inFlight = new Map<string, Deferred.Deferred<boolean, InternalError>>();
  const deliverOnce = Effect.fn("deliverSupportLogOnce")(function* (
    submission: SupportLogSubmission,
    screenshot: ParsedScreenshot | undefined,
  ) {
    const existing = inFlight.get(submission.id);
    if (existing) return yield* Deferred.await(existing).pipe(Effect.as(true));
    const pending = yield* Deferred.make<boolean, InternalError>();
    inFlight.set(submission.id, pending);
    return yield* Effect.gen(function* () {
      const store = yield* Store;
      // Capture each channel's failure so a failed send never interrupts the other channel.
      const results = yield* Effect.forEach(
        channels,
        ({ name, layer }) =>
          Effect.gen(function* () {
            const key = `shotlog:delivered:${submission.id}:${name}`;
            if ((yield* store.get(key)) !== undefined) return true;
            const delivery = yield* Delivery;
            yield* delivery.deliver(submission, screenshot);
            yield* store.increment(key, 24 * 60 * 60);
            return false;
          }).pipe(Effect.provide(layer), Effect.either),
        { concurrency: "unbounded" },
      );
      for (const result of results) {
        if (Either.isLeft(result)) return yield* Effect.fail(result.left);
      }
      return results.every((result) => Either.isRight(result) && result.right);
    }).pipe(
      Effect.onExit((exit) => Deferred.done(pending, exit)),
      Effect.ensuring(Effect.sync(() => inFlight.delete(submission.id))),
    );
  });

  const handle = Effect.fn("handleSupportRequest")(function* (
    request: Request,
  ) {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    yield* checkRequest(request, screenshotBytes);
    const reporterId = config.authorize
      ? yield* authorizeRequest(request, config.authorize)
      : undefined;
    if (config.rateLimit !== false) {
      const ip = clientIp(request)?.trim();
      // One shared bucket for every IP-less request would throttle all users together.
      if (ip) yield* checkRateLimit("ip", ip, config.rateLimit ?? {});
      else warnNoIp();
    }
    const { submission, screenshot } = yield* parseSubmission(
      request,
      screenshotBytes,
    );
    // Only an authenticated id: a body-supplied reporter.id would let anyone exhaust another user's limit.
    if (config.rateLimit !== false && reporterId !== undefined)
      yield* checkRateLimit("reporter", reporterId, config.rateLimit ?? {});
    const duplicate = yield* deliverOnce(submission, screenshot);
    const body: SubmitSuccessBody = {
      ok: true,
      id: submission.id,
      shortId: submission.shortId,
      duplicate,
    };
    return Response.json(body);
  });

  // Admission control before the body is read: per-request limits alone don't bound memory
  // when many large submissions arrive while deliveries are slow.
  let active = 0;
  return async (request) => {
    if (active >= concurrentRequests)
      return errorResponse(
        new Public.RateLimited(5, "The Relay Endpoint is busy"),
      );
    active += 1;
    try {
      return await runPublic(
        handle(request).pipe(
          Effect.catchAllDefect((error) =>
            Effect.sync(() => defectResponse(error, channel)),
          ),
          Effect.provide(services),
        ),
      ).catch((error: unknown) => respondToFailure(error, channel));
    } finally {
      active -= 1;
    }
  };
}
