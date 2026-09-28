import type { EmailLabels, EmailProvider } from "./email-types.js";

/**
 * Server-owned email destination, transport, and template labels.
 * @example
 * ```ts
 * const email: EmailConfig = { to: "support@example.com", from: "reports@example.com", provider: resend({ apiKey }) };
 * ```
 * @public
 */
export interface EmailConfig {
  readonly to: string | readonly string[];
  readonly from: string;
  readonly provider: EmailProvider;
  readonly labels?: Partial<EmailLabels>;
}

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
 * At least one server-owned delivery destination. When both are configured, both receive the report.
 * @example
 * ```ts
 * const delivery: DeliveryConfig = { webhook: { url: "https://support.example.com/logs", secret: "shared-secret" } };
 * ```
 * @public
 */
export type DeliveryConfig =
  | { readonly email: EmailConfig; readonly webhook?: WebhookConfig }
  | { readonly webhook: WebhookConfig; readonly email?: EmailConfig };

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
 * Fixed-window limits applied independently per client IP and per authenticated reporter
 * (the `reporterId` returned by `authorize`).
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
  /**
   * Requests processed at once by this handler instance. Extra requests get RateLimited
   * (retry in 5 s) before their body is read, bounding memory. Defaults to 16.
   */
  readonly concurrentRequests?: number;
}

/**
 * What `authorize` may return. `reporterId` should come from your session, not the request
 * body; it keys the per-reporter rate limit so one user can't exhaust another's.
 * @public
 */
export type AuthorizeResult = boolean | { readonly reporterId: string };

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
   * Return `{ reporterId }` to also rate-limit per authenticated user.
   * Unexpected throws are logged and produce a generic 500. Omission warns once at creation.
   */
  readonly authorize?: (
    request: Request,
  ) => AuthorizeResult | Promise<AuthorizeResult>;
  /** Defaults to 5 requests per 600 seconds; false disables both IP and reporter limits. */
  readonly rateLimit?: false | RateLimitConfig;
  /**
   * Overrides IP resolution. By default, requests adapted by `toNodeHandler` use the socket
   * address (see `trustProxy`); other runtimes use platform headers (cf-connecting-ip,
   * x-real-ip, then the first x-forwarded-for entry). Without an IP, per-IP limits are skipped.
   */
  readonly getClientIp?: (request: Request) => string | undefined;
  /**
   * With `toNodeHandler` behind a reverse proxy, set true to read the client IP from
   * forwarded headers instead of the proxy's socket address. Defaults to false, because
   * without a proxy those headers are client-controlled.
   */
  readonly trustProxy?: boolean;
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
