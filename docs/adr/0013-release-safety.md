# ADR-0013: Release safety — nothing ships unless everything still works

**Status:** Accepted, 2026-09-28

## Context
The goal is that no published version can fix one feature and silently break another. Effect (ADR-0012) makes each unit robust, but it can't catch:
- Browser-specific breakage
- Provider API drift
- Accidental changes to the public API
- Accidental changes to the Support Log payload

## Decision
All six layers are in place from day one:
1. **Public API snapshot.** API Extractor keeps a committed API report for every entry point. CI fails on any unacknowledged change.
2. **Support Log contract snapshot.** The published JSON Schema is snapshotted, and CI fails on changes unless `schemaVersion` is bumped.
3. **Type-level tests.** These check how the public types behave for consumers: autocomplete-relevant inference, `_tag` narrowing, no `effect` in `.d.ts` (ADR-0012).
4. **Unit and integration tests (Vitest)** for the server pipeline:
   - Validation
   - Authorize Hook
   - Rate limiting
   - Each Email Provider
   - Webhook with signing
   - UploadFile upload, including the timeout → base64 fallback
5. **End-to-end tests in real browsers.** Playwright runs on Chromium, Firefox, and WebKit against the Playground and a Next.js example. An in-process SMTP catcher (`smtp-server`) catches email and a local receiver catches webhooks. The full flow is checked: open → capture → annotate → submit → assert what arrived.
6. **Release gate.** Changesets are required for every change, and CI is the only publish path. Publishing happens only when 1–5 pass, with npm provenance.

The **Playground** (a local test app environment) is part of this repo from the start. It's used for day-to-day development and as the target for the end-to-end tests.

### Production smoke test
A **blocking real-provider Smoke Test runs before any production release**. That means an npm publish to the `latest` tag, or a deploy of shotlog.dev.
- It sends one real Support Log through each channel and checks that it arrived:
  - **Resend** and **SES**, to a test inbox that we control
  - The **Webhook**, to a test receiver, including signature verification
  - **UploadFile**, in both `public` and `private` modes
- Anything it uploads is deleted afterwards.
- If any check fails, the release stops. A documented manual override exists only for the case where a provider itself is down.
- Generic SMTP is covered by the in-process SMTP catcher and is not part of the Smoke Test.

The Smoke Test is **not required** for:
- Staging deploys
- Prerelease npm tags (`next`, `canary`)
- Ordinary pull request CI

These still run layers 1–5.

A scheduled nightly provider check was considered and **not adopted for now**.

## Consequences
- The CI setup is significant, but it's the price of the "never break something by accident" goal.
- Breaking changes are still possible, but only deliberately: they need a major Changeset, an updated API report, and a bumped `schemaVersion`.
