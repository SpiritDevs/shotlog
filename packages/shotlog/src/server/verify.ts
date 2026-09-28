import { runPublic } from "../internal/runtime.js";
import type { VerifyWebhookSignatureOptions } from "./config.js";
import { verifySignature } from "./signature.js";

/**
 * Verify HMAC-SHA256 and timestamp freshness using WebCrypto's constant-time verification.
 * Returns false for missing, malformed, mismatched, or out-of-tolerance signatures.
 * Timestamps up to toleranceSeconds in the past or future are accepted.
 * @example
 * ```ts
 * import { verifyWebhookSignature } from "shotlog/server";
 * async function verify(request: Request, secret: string) {
 *   return verifyWebhookSignature({
 *     payload: await request.text(), header: request.headers.get("x-shotlog-signature"), secret,
 *   });
 * }
 * ```
 * @public
 */
export function verifyWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
  return runPublic(verifySignature(options));
}
