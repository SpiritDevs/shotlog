import { Clock, Context, Effect, Layer } from "effect";
import { RateLimited } from "../internal/errors.js";
import type { RateLimitConfig, ShotlogStore } from "./config.js";

export class Store extends Context.Tag("shotlog/Store")<
  Store,
  {
    readonly get: (key: string) => Effect.Effect<number | undefined>;
    readonly increment: (
      key: string,
      ttlSeconds: number,
    ) => Effect.Effect<number>;
  }
>() {}

export function storeLayer(external?: ShotlogStore) {
  if (external) {
    return Layer.succeed(Store, {
      get: Effect.fn("Store.get")((key: string) =>
        Effect.tryPromise(() => external.get(key)).pipe(Effect.orDie),
      ),
      increment: Effect.fn("Store.increment")((key: string, ttl: number) =>
        Effect.tryPromise(() => external.increment(key, ttl)).pipe(
          Effect.orDie,
        ),
      ),
    });
  }

  const maxEntries = 10_000;
  const entries = new Map<string, { value: number; expiresAt: number }>();
  let nextExpiry = Infinity;
  const prune = (now: number) => {
    if (now < nextExpiry) return;
    nextExpiry = Infinity;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
      else nextExpiry = Math.min(nextExpiry, entry.expiresAt);
    }
  };

  return Layer.succeed(Store, {
    get: Effect.fn("Store.get")(function* (key: string) {
      prune(yield* Clock.currentTimeMillis);
      return entries.get(key)?.value;
    }),
    increment: Effect.fn("Store.increment")(function* (
      key: string,
      ttl: number,
    ) {
      const now = yield* Clock.currentTimeMillis;
      prune(now);
      if (!entries.has(key) && entries.size >= maxEntries) {
        // Prefer a duplicate delivery over resetting a live abuse-protection window.
        let oldestDelivered: string | undefined;
        for (const candidate of entries.keys()) {
          if (candidate.startsWith("shotlog:delivered:")) {
            oldestDelivered = candidate;
            break;
          }
        }
        if (oldestDelivered !== undefined) entries.delete(oldestDelivered);
        else
          return key.startsWith("shotlog:rate:") ? Number.MAX_SAFE_INTEGER : 1;
      }
      const entry = entries.get(key) ?? {
        value: 0,
        expiresAt: now + ttl * 1000,
      };
      entry.value += 1;
      entries.set(key, entry);
      nextExpiry = Math.min(nextExpiry, entry.expiresAt);
      return entry.value;
    }),
  });
}

export const checkRateLimit = Effect.fn("checkRateLimit")(function* (
  kind: "ip" | "reporter" | "recording-ip" | "recording-reporter",
  identity: string,
  config: RateLimitConfig,
) {
  const store = yield* Store;
  const now = yield* Clock.currentTimeMillis;
  const windowMs = (config.windowSeconds ?? 600) * 1000;
  const window = Math.floor(now / windowMs);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((window + 1) * windowMs - now) / 1000),
  );
  const count = yield* store.increment(
    `shotlog:rate:${kind}:${encodeURIComponent(identity)}:${window}`,
    retryAfterSeconds,
  );
  if (count > (config.max ?? 5)) {
    return yield* new RateLimited({ retryAfterSeconds });
  }
});
