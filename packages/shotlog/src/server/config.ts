/**
 * Webhook delivery settings. Credentials and destinations stay on the server.
 * @example
 * ```ts
 * const webhook: WebhookConfig = { url: "https://support.example.com/logs", secret: "shared-secret" };
 * ```
 * @public
 */
export interface WebhookConfig {
  /** HTTP(S) endpoint receiving the Support Log as JSON. */
  readonly url: string;
  /** Shared HMAC-SHA256 secret used to sign each delivery. */
  readonly secret: string;
  /** Timeout per attempt in milliseconds. Defaults to 10,000; at most two retries. */
  readonly timeoutMs?: number;
}

/**
 * Delivery destination. Additional channel variants can be added in later releases.
 * @example
 * ```ts
 * const delivery: DeliveryConfig = { webhook: { url: "https://support.example.com/logs", secret: "shared-secret" } };
 * ```
 * @public
 */
export type DeliveryConfig = { readonly webhook: WebhookConfig };

/**
 * Shared storage for rate limits and delivered IDs. Use a shared backend for multiple instances.
 * Store operations must be atomic; Shotlog supplies namespaced keys and expiry durations.
 * @example
 * ```ts
 * const handler = createSupportHandler({ delivery, store: redisBackedStore });
 * ```
 * @public
 */
export interface ShotlogStore {
  /** Return the current value, or undefined when absent or expired. */
  get(key: string): Promise<number | undefined>;
  /** Atomically add one, starting at one. Set the TTL only when creating the key. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

/**
 * Fixed-window limits applied independently to client IP and reporter.id when present.
 * @example
 * ```ts
 * const rateLimit: RateLimitConfig = { max: 5, windowSeconds: 600 };
 * ```
 * @public
 */
export interface RateLimitConfig {
  /** Requests allowed per key and window. Defaults to 5. */
  readonly max?: number;
  /** Window duration in seconds. Defaults to 600. */
  readonly windowSeconds?: number;
}

/**
 * Multipart limits. JSON is always capped at 256 KiB; framing has a 16 KiB allowance.
 * @example
 * ```ts
 * const limits: SupportHandlerLimits = { screenshotBytes: 2 * 1024 * 1024 };
 * ```
 * @public
 */
export interface SupportHandlerLimits {
  /** Maximum PNG bytes. Defaults to 5 MiB. */
  readonly screenshotBytes?: number;
}

/**
 * Server-side Relay Endpoint configuration.
 * @example
 * ```ts
 * const config: SupportHandlerConfig = {
 *   delivery: { webhook: { url: "https://support.example.com/logs", secret: "shared-secret" } },
 *   authorize: (request) => request.headers.get("authorization") === "Bearer host-session",
 * };
 * ```
 * @public
 */
export interface SupportHandlerConfig {
  /** Server-owned delivery channel and credentials. */
  readonly delivery: DeliveryConfig;
  /**
   * Runs before reading the body. Return false for 403, or throw Unauthorized / Forbidden.
   * Unexpected throws are logged and produce a generic 500. Omission warns once at creation.
   */
  readonly authorize?: (request: Request) => boolean | Promise<boolean>;
  /** Defaults to 5 requests per 600 seconds; false disables both IP and reporter limits. */
  readonly rateLimit?: false | RateLimitConfig;
  /**
   * Overrides IP resolution. By default: first x-forwarded-for entry, x-real-ip, then
   * cf-connecting-ip. Forwarded headers are trustworthy only behind a trusted proxy.
   * Requests without an IP share one fallback bucket.
   */
  readonly getClientIp?: (request: Request) => string | undefined;
  /** Defaults to lazy-expiring in-memory storage, protecting only this handler instance. */
  readonly store?: ShotlogStore;
  /** Screenshot and total streaming body limits. */
  readonly limits?: SupportHandlerLimits;
}

/**
 * Inputs for checking a signed Webhook. Preserve the raw request body before parsing JSON.
 * @example
 * ```ts
 * const options: VerifyWebhookSignatureOptions = {
 *   payload: await request.text(), header: request.headers.get("x-shotlog-signature"), secret,
 * };
 * ```
 * @public
 */
export interface VerifyWebhookSignatureOptions {
  /** Exact, unmodified JSON request body. */
  readonly payload: string;
  /** x-shotlog-signature header, or null if absent. */
  readonly header: string | null;
  /** Shared server-side signing secret. */
  readonly secret: string;
  /** Maximum timestamp skew in either direction, in seconds. Defaults to 300. */
  readonly toleranceSeconds?: number;
}
