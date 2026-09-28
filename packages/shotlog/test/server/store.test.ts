import { Effect, TestClock, TestContext } from "effect";
import { expect, test } from "vitest";
import { Store, storeLayer } from "../../src/server/store.js";

test("in-memory increments keep the original TTL and expire rate and dedupe keys using Clock", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Store;
      expect(yield* store.increment("rate", 10)).toBe(1);
      expect(yield* store.increment("delivered", 86400)).toBe(1);
      yield* TestClock.adjust("9 seconds");
      expect(yield* store.increment("rate", 10)).toBe(2);
      yield* TestClock.adjust("1 second");
      expect(yield* store.get("rate")).toBeUndefined();
      expect(yield* store.get("delivered")).toBe(1);
      expect(yield* store.increment("rate", 10)).toBe(1);
      yield* TestClock.adjust("24 hours");
      expect(yield* store.get("rate")).toBeUndefined();
      expect(yield* store.get("delivered")).toBeUndefined();
    }).pipe(
      Effect.provide(storeLayer()),
      Effect.provide(TestContext.TestContext),
    ),
  );
});

test("capacity pressure evicts delivered IDs in order without resetting live rate limits", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Store;
      const rate = "shotlog:rate:ip:existing";
      const oldest = "shotlog:delivered:oldest";
      const newer = "shotlog:delivered:newer";
      yield* store.increment(rate, 600);
      yield* store.increment(oldest, 86400);
      yield* store.increment(newer, 86400);
      for (let index = 0; index < 9997; index += 1)
        yield* store.increment(`shotlog:rate:ip:${index}`, 600);
      expect(yield* store.increment("shotlog:rate:ip:replacement-1", 600)).toBe(
        1,
      );
      expect(yield* store.get(oldest)).toBeUndefined();
      expect(yield* store.get(newer)).toBe(1);
      expect(yield* store.increment("shotlog:rate:ip:replacement-2", 600)).toBe(
        1,
      );
      expect(yield* store.get(newer)).toBeUndefined();
      expect(yield* store.increment("shotlog:rate:ip:overflow", 600)).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(yield* store.get("shotlog:rate:ip:overflow")).toBeUndefined();
      expect(yield* store.increment("shotlog:delivered:overflow", 86400)).toBe(
        1,
      );
      expect(yield* store.get("shotlog:delivered:overflow")).toBeUndefined();
      expect(yield* store.increment(rate, 600)).toBe(2);
      yield* TestClock.adjust("600 seconds");
      expect(yield* store.increment("shotlog:rate:ip:overflow", 600)).toBe(1);
    }).pipe(
      Effect.provide(storeLayer()),
      Effect.provide(TestContext.TestContext),
    ),
  );
});
