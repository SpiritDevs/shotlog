import { ValidationFailed } from "./errors.js";

/**
 * Derives the readable Support Log ID from the final 20 bits of a UUID.
 * The full UUID remains the identity for safe retries; short IDs can collide.
 * @example
 * ```ts
 * getShortId("00000000-0000-4000-8000-000000000001"); // "SL-0001"
 * ```
 * @public
 */
export function getShortId(id: string): string {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    throw new ValidationFailed(["id must be a UUID"]);
  }
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bits = Number.parseInt(id.slice(-5), 16);
  return `SL-${[15, 10, 5, 0].map((shift) => alphabet[(bits >>> shift) & 31]).join("")}`;
}
