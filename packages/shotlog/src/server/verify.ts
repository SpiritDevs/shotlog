import { runPublic } from "../internal/runtime.js";
import type { VerifyWebhookSignatureOptions } from "./config.js";
import { verifySignature } from "./signature.js";

/**
 * Verify HMAC-SHA256 and timestamp freshness using WebCrypto's constant-time verification.
 * Returns false for missing, malformed, stale, future-dated, or mismatched signatures.
 * @example
 * ```ts
 * const valid = await verifyWebhookSignature({
 *   payload: await request.text(), header: request.headers.get("x-shotlog-signature"), secret,
 * });
 * ```
 * @public
 */
export function verifyWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
  return runPublic(verifySignature(options));
}
