# ADR-0015: What happens after Submit

**Status:** Accepted, 2026-09-28

## Decision
1. **Support Log ID.**
   - A UUID is generated in the browser when the Report Card opens.
   - A short readable form (e.g. `SL-7F3K`) is shown on success and included in the email subject (`[Bug] SL-7F3K · Save button does nothing`), the email body, and the webhook JSON.
2. **Safe retries.** The Relay Endpoint remembers recently delivered IDs and ignores repeats, so a retry after a timeout never delivers twice. The ID store is swappable, like the rate-limit store (ADR-0008).
3. **Drafts.**
   - The Type and Description survive closing the card: in memory while the page is open, and in `sessionStorage` if the page reloads.
   - The Screenshot is kept **in memory only**. It's never persisted, because of its size and because it may contain sensitive data.
4. **While sending.** Submit shows progress. Closing the card doesn't cancel the send.
5. **Success.**
   - The card shows "Sent ✓ · SL-7F3K" and closes itself after about 3 seconds.
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
- Retries can't cause duplicate emails or webhooks.
