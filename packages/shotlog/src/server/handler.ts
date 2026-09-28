import { Deferred, Effect, Layer } from "effect";
import * as Public from "../errors.js";
import {
  Forbidden,
  type InternalError,
  Unauthorized,
} from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import { errorResponse, type SubmitSuccessBody } from "../internal/wire.js";
import type { SupportLogSubmission } from "../types.js";
import type { SupportHandlerConfig } from "./config.js";
import {
  checkRequest,
  inlineScreenshot,
  type ParsedScreenshot,
  parseSubmission,
} from "./multipart.js";
import { checkRateLimit, Store, storeLayer } from "./store.js";
import { Delivery, webhookLayer } from "./webhook.js";

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
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function respondToFailure(error: unknown): Response {
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
  return defectResponse(error);
}

function defectResponse(error: unknown): Response {
  console.error("shotlog: unexpected Relay Endpoint failure", error);
  const response = errorResponse(
    new Public.DeliveryFailed(
      "webhook",
      "The Support Log could not be processed",
    ),
  );
  return new Response(response.body, {
    status: 500,
    headers: response.headers,
  });
}

/**
 * Create a Fetch-standard Relay Endpoint with authorization, bounded multipart parsing,
 * rate limits, deduplication, and signed Webhook delivery. Successful IDs expire after 24 hours.
 * Concurrent copies are coalesced within this handler; shared stores remember completed
 * deliveries across instances but cannot lock simultaneous deliveries across instances.
 * @example
 * ```ts
 * export const POST = createSupportHandler({
 *   delivery: { webhook: { url: "https://support.example.com/logs", secret: "shared-secret" } },
 *   authorize: async (request) => Boolean(await getSession(request)),
 * });
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
  const screenshotBytes = config.limits?.screenshotBytes ?? 5 * 1024 * 1024;
  const services = Layer.merge(
    storeLayer(config.store),
    webhookLayer(config.delivery.webhook),
  );
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
      const key = `shotlog:delivered:${submission.id}`;
      if ((yield* store.get(key)) !== undefined) return true;
      const delivery = yield* Delivery;
      yield* delivery.deliver(
        screenshot
          ? { ...submission, screenshot: inlineScreenshot(screenshot) }
          : submission,
      );
      yield* store.increment(key, 24 * 60 * 60);
      return false;
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
    if (config.authorize) yield* authorizeRequest(request, config.authorize);
    if (config.rateLimit !== false) {
      const ip = config.getClientIp
        ? config.getClientIp(request)?.trim() || "unknown"
        : clientIp(request);
      yield* checkRateLimit("ip", ip, config.rateLimit ?? {});
    }
    const { submission, screenshot } = yield* parseSubmission(
      request,
      screenshotBytes,
    );
    if (config.rateLimit !== false && submission.reporter?.id !== undefined) {
      yield* checkRateLimit(
        "reporter",
        submission.reporter.id,
        config.rateLimit ?? {},
      );
    }
    const duplicate = yield* deliverOnce(submission, screenshot);
    const body: SubmitSuccessBody = {
      ok: true,
      id: submission.id,
      shortId: submission.shortId,
      duplicate,
    };
    return Response.json(body);
  });

  return (request) =>
    runPublic(
      handle(request).pipe(
        Effect.catchAllDefect((error) =>
          Effect.sync(() => defectResponse(error)),
        ),
        Effect.provide(services),
      ),
    ).catch(respondToFailure);
}
