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
