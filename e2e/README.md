# Browser tests

```sh
pnpm install
cd e2e
pnpm exec playwright install chromium firefox webkit
cd ..
pnpm e2e
pnpm e2e:chromium
```

Playwright builds the library first, starts its own Playground on 5299 (SMTP
2625), then builds and starts the Next.js consumer on 5300. Existing servers are
never reused. Keep 5199/2525 for the ordinary development Playground.

The suite runs one worker because the Playground has shared in-memory settings,
rate limits and inboxes. Each test resets those stores through the Playground's
settings and inbox APIs. Assertions read actual email and webhook deliveries.
The capture fixture's external resources are served through Playwright routes
while retaining their original cross-origin URLs and CORS policy.

The stalled-relay test drives the client's 60-second deadline with `page.clock`.
The Next.js test captures, annotates, redacts, and submits through built `dist`
chunks, and verifies the delivered PNG pixels. Its server sets `SHOTLOG_DEMO=1`.
The Playground's rate window is set to `315360000` seconds (10 years) so the
exactly-five-successes test cannot realistically cross a fixed-window boundary.
There are no arbitrary sleeps or automatic retries. HTML, JSON and failure traces
are under `e2e/playwright-report` and `e2e/test-results`.

To reproduce one scenario, append a title filter and project:

```sh
pnpm e2e --project=chromium --grep 'lost response'
```
