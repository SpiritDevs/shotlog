# ADR-0012: TypeScript throughout, Effect internally only, with fully exported types

**Status:** Accepted, 2026-09-28

## Context
This is a library, so its types *are* its interface. Developers, and the AI assistants helping them, should be able to discover and use every function, config option, payload, and error through autocomplete alone. The in-house stack already uses Effect: `@uploadfile/core` depends on `effect` 3.17.

## Decision
- **Strict TypeScript everywhere.** No `any` in public signatures, and `.d.ts` files for every entry point.
- **Built on Effect** for correctness:
  - Typed errors
  - Timeouts and retries (e.g. the UploadFile upload timeout and base64 fallback)
  - Resource safety (patching and restoring `console`/`fetch` for the Diagnostic Trail)
  - Swappable providers
- **One source of truth for the Support Log shape**, using `effect/Schema`. From it we derive:
  - The TypeScript types
  - Runtime validation in the Relay Endpoint (ADR-0008)
  - A **published JSON Schema** for Webhook receivers
  - The `schemaVersion` field
- **Everything is exported:**
  - Every config type
  - The Support Log and its parts
  - Every result type
  - Every error as a tagged class (e.g. `RateLimited`, `Unauthorized`, `PayloadTooLarge`, `DeliveryFailed`, `UploadFailed`)
  - The Storage Adapter and Email Provider interfaces
- **TSDoc on every public symbol**, with `@example` blocks, so editors and AI assistants show usage inline.

## Effect stays internal
- **No Effect types ever appear in the public API.** Every public function uses plain `async`/Promise signatures, plain config objects, and plain return types.
- Effect is used **only inside the library**, so that each feature's failure modes are explicit and checked by the compiler. A change to one feature then can't silently break another.
- Public errors are plain `Error` subclasses with a string `_tag` (e.g. `class RateLimited extends Error { readonly _tag = "RateLimited" }`). They are **not** Effect's `Data.TaggedError`, so `instanceof` and `switch (err._tag)` both narrow correctly without Effect showing through.
- Effect runs only at the edges: public functions call `Effect.runPromise` and map internal errors to the public error classes.
- The public schema is exposed as JSON Schema and TS types, never as an `effect/Schema` object.
- A build check fails if any emitted public `.d.ts` references `effect`.
- On the client, Effect is kept to a minimum (mainly `Schema` and core `Effect`) to keep the widget bundle small.

## Consequences
- Effect is a real dependency. Its client bundle size needs watching.
- The Support Log schema changes deliberately, never by accident.
