# ADR-0015: What happens after Submit

**Status:** Accepted, 2026-09-28

## Decision
1. **Support Log ID.**
   - A UUID is generated in the browser when the Report Card opens.
   - A short readable form (e.g. `SL-7F3K`) is shown on success and included in the email subject (`[Bug] SL-7F3K · Save button does nothing`), the email body, and the webhook JSON.
2. **Safe retries, at-least-once delivery.**
   - The Relay Endpoint remembers delivered IDs **per channel** and ignores repeats, so a Reporter's retry doesn't normally deliver twice.
   - The pending ID is saved with the draft, so a retry after a page reload can be deduped while the delivered record is retained. Editing after a failure starts a new ID.
   - Exactly-once delivery is not achievable:
     - An email provider or webhook receiver may accept delivery but the response gets lost, including when the request is aborted on timeout.
     - Two instances may receive the same ID at the same moment.
     - Delivered records expire after 24 hours, can be evicted under memory pressure, and are lost on restart with the in-memory store.
   - Delivery is therefore **at least once**. Receivers dedupe on `x-shotlog-id` / `log.id`.
   - The ID store is swappable, like the rate-limit store (ADR-0008).
3. **Drafts.**
   - The Type and Description survive closing the card: in memory while the page is open, and in `sessionStorage` if the page reloads.
   - `draftScope` selects `shotlog:draft:<scope>` (or `shotlog:draft` when omitted). Host Apps pass the signed-in user's ID. Changing scope drops the in-memory draft, identity, and Screenshot before loading that scope's draft.
   - `persistDraft={false}` keeps drafts and pending IDs in memory only. `useShotlog().clearDraft()` clears the current scope's stored and in-memory draft, identity, and Screenshot; call it before sign-out. Scope changes and explicit clearing discard updates from pending operations, though a request already sent can still be delivered.
   - The Screenshot is kept **in memory only**. It's never persisted, because of its size and because it may contain sensitive data.
4. **While sending.** Submit shows progress. Closing the card doesn't cancel the send.
   - The client allows **60 seconds total** to send the request and read its response, using an AbortController and a cleared JavaScript timer. A stalled relay becomes an Offline failure with Retry available.
   - After parsing, the default Webhook delivery budget is **10 seconds for storage + 3 × 10 seconds for HTTP attempts + 600 ms backoff**. Email runs in parallel. The client budget leaves room for normal upload/response overhead; slow incoming bodies, larger configured webhook timeouts, or custom Email Providers can exceed it.
5. **Success.**
   - The card shrinks to a compact "Report sent · Reference SL-7F3K" state and closes itself after about 3 seconds, unless the pointer or a visible keyboard focus is holding it open.
   - The draft is cleared.
   - The `onSubmitted(result)` callback fires.
6. **Failure.**
   - A human-readable inline message is shown for each typed error (401/403/413/429/delivery failure/offline).
   - A Retry button is shown and the draft is kept.
   - The `onError(err)` callback fires.
7. **No offline queue in v1.** When offline, the Reporter sees "You're offline" and can retry manually.
8. **Keyboard shortcut, opt-in.** Off by default. When enabled, a configurable combination (e.g. `Ctrl/Cmd+Shift+.`) opens the Report Card.

## Consequences
- Every Support Log can be traced end to end by its ID.
- Retries are at least once and can duplicate emails or webhooks; per-channel deduplication reduces repeats while delivered records are retained.
