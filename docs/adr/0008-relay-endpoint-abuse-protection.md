# ADR-0008: Protecting the Relay Endpoint from abuse

**Status:** Accepted, 2026-09-28

## Context
When the widget is shown to regular users, the Relay Endpoint is a public URL that sends email and webhooks for the Host App. Anyone can replay or script requests to it. The risks are inbox flooding, provider bills, damage to the sending domain's reputation, and, if recipients could be set by the client, an open relay.

## Decision
The Server Helper applies these protections.

**Always on (can't be turned off):**
1. **Destinations are set on the server only.** Email recipients and webhook URLs come from the Server Helper's config, never from the request.
2. **Size limits.** The Screenshot is capped (default 5 MB after flattening), and the Description, `reporter`, and `metadata` have size caps. Oversized requests are rejected before any delivery.
3. **Schema validation.** The payload is validated on the server, and anything that doesn't match is rejected.

**On by default, can be overridden:**
4. **`authorize(request)` hook.** The Host App plugs in its own session or role check. It can return `{ reporterId }` from the session; that authenticated ID, never the body's `reporter.id`, keys the per-reporter limit.
5. **Rate limiting.**
   - Limited per IP and per authenticated reporter (default 5 per 10 minutes).
   - The in-memory store is capped at 10k keys. After pruning expired keys, capacity pressure evicts the oldest delivered-ID key, never a live rate-limit key. If only live rate-limit keys remain, new rate keys are denied and new delivered IDs are not stored. Multi-instance deployments can plug in their own store (e.g. Redis).
   - `getClientIp` overrides all IP resolution. Otherwise, configure `ipHeader` as the one header your proxy or platform sets: `x-real-ip` on Vercel, `cf-connecting-ip` on Cloudflare, or `x-forwarded-for` behind nginx. For `x-forwarded-for`, use the last entry (the one the proxy appended). The configured header wins over the socket address; only trust a header the proxy overwrites or appends.
   - Without `ipHeader`, `toNodeHandler` supplies the socket address outside headers so clients cannot spoof it. Without either source, skip per-IP limits and warn once to configure `ipHeader` or `getClientIp`. No generic header fallback is used.
6. **Concurrency cap.** Default 16 requests in flight per instance, checked before the body is read. Extra requests get a 5 s RateLimited, which bounds memory. Aborted uploads and bodies not received within 30 seconds are cancelled and release their admission slot.

The Server Helper logs a warning at startup if no `authorize` hook is configured.

**Not in v1:**
- CAPTCHA: adds friction, and not needed given the protections above.
- Client request signing: the key would be exposed in the browser, so it adds nothing.

## Consequences
- Admin-only setups are fully protected with a one-line `authorize` hook.
- In-memory rate limiting only protects a single instance. This is documented, and the storage is replaceable.
- The client has to handle 401/403/413/429 responses gracefully on the Report Card.
