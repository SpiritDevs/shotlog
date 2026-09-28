# Next.js example

A local App Router consumer of the built `shotlog` workspace package. This app
has its own TypeScript configuration, without the repository's source aliases.
React 19 is used here; the Playground and library development remain on React 18.

From the repository root:

```sh
pnpm build
pnpm --filter next-example build
pnpm --filter next-example start
```

Open http://127.0.0.1:5300, submit a report, and inspect `/api/inbox`.
The relay signs webhooks; the inbox rejects invalid signatures and retains the
last 100 reports in process memory. Restarting the app clears the inbox.

`NEXT_EXAMPLE_ORIGIN` configures the server's webhook destination.
`SHOTLOG_WEBHOOK_SECRET` configures the shared signing secret. Defaults are for
local development; a deployed Host App must supply its own secret and authorize
hook, and protect or replace this example inbox.
