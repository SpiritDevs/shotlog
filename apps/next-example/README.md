# Next.js example

A local App Router consumer of the built `shotlog` workspace package. This app
has its own TypeScript configuration, without the repository's source aliases.
React 19 is used here; the Playground and library development remain on React 18.
Capture and the Annotation Editor load the package's emitted lazy chunks.

From the repository root, explicitly enable the local demo for build and startup:

```sh
pnpm build
SHOTLOG_DEMO=1 pnpm --filter next-example build
SHOTLOG_DEMO=1 pnpm --filter next-example start
```

Open http://127.0.0.1:5300, capture the sample account page, annotate it with a
Rectangle and Solid redaction, then submit and inspect `/api/inbox`.
The relay signs webhooks; the inbox rejects invalid signatures and retains the
last 100 reports in process memory. Restarting the app clears the inbox.

Only `SHOTLOG_DEMO=1` permits anonymous reports, a readable inbox, and the local
fallback signing secret. Without it, the Authorize Hook returns false,
`GET /api/inbox` returns 404, and a missing `SHOTLOG_WEBHOOK_SECRET` throws during
startup (and the production build). Replace the hook with your session check
before accepting reports in a deployed Host App; do not enable demo mode there.

`NEXT_EXAMPLE_ORIGIN` configures the server's webhook destination (default
`http://127.0.0.1:5300`). `SHOTLOG_WEBHOOK_SECRET` configures the shared signing
secret. The example uses `ipHeader: "x-real-ip"` for Vercel; change this to the
header your own trusted proxy overwrites or appends on other deployments.
