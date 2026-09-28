import { Deferred, Effect, Either } from "effect";
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
});

/** Set by toNodeHandler from the socket; any client-supplied copy is discarded there. */
export const socketAddressHeader = "x-shotlog-socket-address";

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get(socketAddressHeader)?.trim() ||
    undefined
  );
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
 * Create a Fetch-standard Relay Endpoint with authorization, bounded multipart parsing,
 * rate limits, per-channel deduplication, and Email / signed Webhook delivery.
 * Successful channel deliveries expire after 24 hours.
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
      "shotlog: could not determine the client IP; per-IP rate limiting is skipped. Pass getClientIp.",
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
    if (config.authorize) yield* authorizeRequest(request, config.authorize);
    if (config.rateLimit !== false) {
      const ip = (config.getClientIp ?? clientIp)(request)?.trim();
      // One shared bucket for every IP-less request would throttle all users together.
      if (ip) yield* checkRateLimit("ip", ip, config.rateLimit ?? {});
      else warnNoIp();
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
          Effect.sync(() => defectResponse(error, channel)),
        ),
        Effect.provide(services),
      ),
    ).catch((error: unknown) => respondToFailure(error, channel));
}
