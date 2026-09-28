import type { EmailLabels, EmailProvider } from "./email-types.js";
import type { StorageAdapter } from "./storage-types.js";

/**
 * Server-owned email destination, transport, and template labels.
 * @example
 * ```ts
 * import { resend, type EmailConfig } from "shotlog/server";
 * const email: EmailConfig = {
 *   to: "support@example.com",
 *   from: "reports@example.com",
 *   provider: resend({ apiKey: process.env.RESEND_API_KEY! }),
 * };
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
 * import type { WebhookConfig } from "shotlog/server";
 * const webhook: WebhookConfig = { url: "https://support.example.com/logs", secret: "shared-secret" };
 * ```
 * @public
 */
export type WebhookConfig = {
  /** HTTP(S) endpoint receiving the Support Log as JSON. */
  readonly url: string;
  /** Shared HMAC-SHA256 secret used to sign each delivery. */
  readonly secret: string;
  /** Timeout per attempt in milliseconds. Defaults to 10,000; at most two retries.
   * The client has a 60-second total request budget, including storage and backoff. */
  readonly timeoutMs?: number;
} & (
  | {
      /** Defaults to base64: embeds the PNG without storage. */
      readonly screenshotMode?: "base64";
      readonly storage?: never;
    }
  | {
      /** Upload uses storage, with a 10-second timeout and inline fallback. */
      readonly screenshotMode: "upload";
      /** Required for upload mode. Only Webhook Screenshots are uploaded; Email embeds the PNG. */
      readonly storage: StorageAdapter;
    }
);

/**
 * At least one server-owned delivery destination. When both are configured, both receive the report.
 * @example
 * ```ts
 * import type { DeliveryConfig } from "shotlog/server";
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
 * import type { ShotlogStore } from "shotlog/server";
 * async function delivered(store: ShotlogStore, id: string) {
 *   return (await store.get(`shotlog:delivered:${id}:webhook`)) !== undefined;
 * }
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
 * Fixed-window limits applied per client IP and per authenticated Reporter.
 * The Reporter key is the `reporterId` returned by `authorize`.
 * @example
 * ```ts
 * import type { RateLimitConfig } from "shotlog/server";
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
 * import type { SupportHandlerLimits } from "shotlog/server";
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
 * The Authorize Hook result: allow, deny, or allow with an authenticated Reporter ID.
 * `reporterId` must come from your session; it keys the per-reporter rate limit.
 * @example
 * ```ts
 * import type { AuthorizeResult } from "shotlog/server";
 * const allowed: AuthorizeResult = { reporterId: "authenticated-user-42" };
 * ```
 * @public
 */
export type AuthorizeResult = boolean | { readonly reporterId: string };

/**
 * Server-side Relay Endpoint configuration.
 * @example
 * ```ts
 * import type { SupportHandlerConfig } from "shotlog/server";
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
   * Overrides all IP resolution, including `ipHeader` and the `toNodeHandler` socket address.
   * Returning undefined skips per-IP limits.
   */
  readonly getClientIp?: (request: Request) => string | undefined;
  /**
   * The single trusted client-IP header set by your proxy or platform, e.g. `x-real-ip`
   * on Vercel, `cf-connecting-ip` on Cloudflare, or `x-forwarded-for` behind nginx.
   * Only trust a header your proxy overwrites or appends. For `x-forwarded-for`, the last
   * entry is used. When configured, this takes precedence over the socket address.
   * Otherwise, `toNodeHandler` supplies the socket address. Without either source,
   * per-IP limits are skipped with a one-time warning; headers are never auto-detected.
   */
  readonly ipHeader?: string;
  /** Defaults to lazy-expiring in-memory storage, protecting only this handler instance. */
  readonly store?: ShotlogStore;
  /** Screenshot and total streaming body limits. */
  readonly limits?: SupportHandlerLimits;
}

/**
 * Inputs for checking a signed Webhook. Preserve the raw request body before parsing JSON.
 * @example
 * ```ts
 * import type { VerifyWebhookSignatureOptions } from "shotlog/server";
 * async function signatureOptions(request: Request, secret: string): Promise<VerifyWebhookSignatureOptions> {
 *   return { payload: await request.text(), header: request.headers.get("x-shotlog-signature"), secret };
 * }
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
