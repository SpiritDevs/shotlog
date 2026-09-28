import { Clock, Effect } from "effect";
import type { VerifyWebhookSignatureOptions } from "./config.js";

const encoder = new TextEncoder();

const importKey = Effect.fn("importWebhookKey")((secret: string) =>
  Effect.tryPromise(() =>
    crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    ),
  ).pipe(Effect.orDie),
);

export const signWebhook = Effect.fn("signWebhook")(function* (
  payload: string,
  secret: string,
) {
  const timestamp = Math.floor((yield* Clock.currentTimeMillis) / 1000);
  const key = yield* importKey(secret);
  const signature = yield* Effect.tryPromise(() =>
    crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)),
  ).pipe(Effect.orDie);
  const hex = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${hex}`;
});

export const verifySignature = Effect.fn("verifyWebhookSignature")(function* ({
  payload,
  header,
  secret,
  toleranceSeconds = 300,
}: VerifyWebhookSignatureOptions) {
  const match = header?.match(/^t=(\d+),v1=([a-fA-F0-9]{64})$/);
  if (
    !match?.[1] ||
    !match[2] ||
    !Number.isFinite(toleranceSeconds) ||
    toleranceSeconds < 0
  )
    return false;
  const timestamp = Number(match[1]);
  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > toleranceSeconds
  )
    return false;
  const hex = match[2];
  const signature = Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
  const key = yield* importKey(secret);
  return yield* Effect.tryPromise(() =>
    crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(`${match[1]}.${payload}`),
    ),
  ).pipe(Effect.orDie);
});
