---
name: shotlog
description: Add shotlog to a React app. Covers the report widget, the server endpoint, email, Slack and webhook delivery, screenshot storage, receiving signed webhooks, and the Support Log payload. Use when a user wants in-app bug reports or support requests with an annotated screenshot and debugging context.
---

# shotlog

shotlog adds a report button to a React app. A user describes a problem, captures and annotates a screenshot, and submits. The browser posts the report to an endpoint in the app's own backend. That endpoint delivers it by email, to Slack, by signed webhook, or any combination.

The browser never holds provider keys or destinations. Everything sensitive stays on the server.

Docs: https://shotlog.dev/docs/
Source: https://github.com/SpiritDevs/shotlog

## Install

```sh
npm i shotlog
```

Requirements: ESM only, Node 20.19 or later, React and React DOM 18 or later.

Optional peer packages, installed only when used:

| Need | Install | Import |
| --- | --- | --- |
| Resend email | nothing extra | `resend` from `shotlog/server` |
| Amazon SES email | `@aws-sdk/client-sesv2` | `ses` from `shotlog/ses` |
| SMTP email (Node only) | `nodemailer` | `smtp` from `shotlog/smtp` |
| UploadFile screenshot storage | `@uploadfile/core` | `uploadfile` from `shotlog/uploadfile` |

## Entry points

| Import | Runs in | Main exports |
| --- | --- | --- |
| `shotlog` | browser | `ShotlogProvider`, `useShotlog`, error classes, types |
| `shotlog/server` | any Fetch runtime | `createSupportHandler`, `resend`, `verifyWebhookSignature`, `defaultEmailLabels`, error classes, types |
| `shotlog/node` | Node | `toNodeHandler` |
| `shotlog/ses` | server | `ses` |
| `shotlog/smtp` | Node | `smtp` |
| `shotlog/uploadfile` | server | `uploadfile` |
| `shotlog/locales/pt-BR` | anywhere | `labels`, `emailLabels`, `slackLabels` in Brazilian Portuguese |
| `shotlog/schema.json` | anywhere | JSON Schema for the Support Log |

Never import `shotlog/server` or the provider entries into client code.

## Step 1: add the widget

Wrap the app in `ShotlogProvider`. In the Next.js App Router, put it in a client component.

```tsx
"use client";
import type { ReactNode } from "react";
import { ShotlogProvider } from "shotlog";

export function Providers({ children, user }: { children: ReactNode; user: User }) {
  return (
    <ShotlogProvider
      endpoint="/api/support"
      enabled={user.isStaff}
      draftScope={user.id}
      reporter={{ id: user.id, email: user.email, name: user.name, plan: user.plan }}
      metadata={() => ({ appVersion: "2.4.1", tenant: user.orgId })}
    >
      {children}
    </ShotlogProvider>
  );
}
```

This renders a round support button in the bottom-right corner. It needs no CSS import. The widget renders in a shadow root, so host styles do not leak in or out.

To open the card from your own button, turn off the launcher and use the hook:

```tsx
import { useShotlog } from "shotlog";

function HelpButton() {
  const { open } = useShotlog();
  return <button onClick={open}>Report a problem</button>;
}
// <ShotlogProvider endpoint="/api/support" launcher={false}>...</ShotlogProvider>
```

`useShotlog()` returns `open`, `close`, `isOpen` and `clearDraft`. Call `clearDraft()` on sign-out.

### Provider props

Pass exactly one of `endpoint` or `onSubmit`. TypeScript rejects both or neither.

| Prop | Default | Purpose |
| --- | --- | --- |
| `endpoint` | none | URL of the server endpoint from step 2 |
| `onSubmit` | none | Deliver it yourself instead. Receives `{ log, screenshot }` |
| `enabled` | `true` | `false` removes the widget. Use it to limit reporting to staff or signed-in users |
| `launcher` | `true` | `false` hides the button. `{ content: "icon" \| "text" \| "icon-text", icon }` changes it |
| `position` | `"bottom-right"` | `top-left`, `top-center`, `top-right`, `center`, `bottom-left`, `bottom-center`, `bottom-right` |
| `theme` | `"auto"` | `light`, `dark` or `auto` |
| `accent` | none | CSS colour for the button and Submit |
| `types` | Bug, Question, Idea | Strings or `{ value, label }`. `value` is what gets delivered |
| `reporter` | none | Who is reporting. `id`, `email` and `name` are known fields. Any other JSON fields are kept. Max 16 KB |
| `metadata` | none | Any JSON about the app or session. Max 16 KB |
| `diagnostics` | both on | `{ console, network }` or `false` |
| `draftScope` | none | Pass the signed-in user id so drafts never cross accounts |
| `persistDraft` | `true` | `false` keeps drafts in memory only |
| `labels` | English | A locale's labels, like `ptBR.labels`, or overrides for any UI text, like `{ submit: "Envoyer" }` |
| `shortcut` | none | Keyboard shortcut to open, for example `"Mod+Shift+."` |
| `onSubmitted` | none | Called with `{ id, shortId, duplicate }` after delivery |
| `onError` | none | Called with a shotlog error on failure |

`reporter` and `metadata` accept an object or a function, sync or async. Functions run at submit time.

### Languages

The widget, emails and Slack messages are English by default. For Brazilian Portuguese, import the locale module and pass its labels:

```tsx
import * as ptBR from "shotlog/locales/pt-BR";
<ShotlogProvider endpoint="/api/support" labels={ptBR.labels} />
```

The team reads emails and Slack, so set their language on the server on its own: `email: { ..., labels: ptBR.emailLabels }` and `slack: { ..., labels: ptBR.slackLabels }`. Type chips are translated, but delivered Type values stay `Bug`, `Question` and `Idea`, so routing like `channel: { Bug: "#bugs" }` keeps working. Spread to change one string: `{ ...ptBR.labels, launcher: "Ajuda" }`.

## Step 2: add the server endpoint

Next.js App Router, `app/api/support/route.ts`:

```ts
import { createSupportHandler, resend } from "shotlog/server";

export const runtime = "nodejs";

export const POST = createSupportHandler({
  delivery: {
    email: {
      provider: resend({ apiKey: process.env.RESEND_API_KEY! }),
      from: "Support <support@example.com>",
      to: ["team@example.com"],
    },
  },
  authorize: async (request) => {
    const session = await getSession(request);
    if (!session) return false;
    return { reporterId: session.user.id };
  },
  ipHeader: "x-real-ip",
});
```

Express or plain Node. Mount it before body parsers such as `express.json()`:

```ts
import express from "express";
import { createSupportHandler } from "shotlog/server";
import { toNodeHandler } from "shotlog/node";

const app = express();
app.post("/api/support", toNodeHandler(createSupportHandler(config)));
```

Hono, Bun, Deno and Cloudflare Workers take the handler as it is. It has the signature `(request: Request) => Promise<Response>`.

### Handler options

| Option | Default | Purpose |
| --- | --- | --- |
| `delivery` | required | Any of `email`, `slack` and `webhook`; at least one |
| `authorize` | none | Return `false` for 403. Throw `Unauthorized` for 401. Return `{ reporterId }` to also rate-limit per user. The server logs a warning at startup if this is missing |
| `rateLimit` | 5 per 600 s | `{ max, windowSeconds }` or `false`. Applies per IP and per `reporterId` |
| `limits` | 5 MiB PNG, 16 concurrent | `{ screenshotBytes, concurrentRequests }` |
| `ipHeader` | socket address | Header holding the client IP. Vercel: `x-real-ip`. Cloudflare: `cf-connecting-ip`. Behind nginx: `x-forwarded-for` (the last entry is used) |
| `getClientIp` | none | Custom IP lookup. Overrides `ipHeader` |
| `store` | in memory | `{ get, increment }` backed by Redis or similar. Use it when running more than one server instance |

Without `ipHeader`, `getClientIp` or `toNodeHandler`, the server skips per-IP limits and warns once.

## Step 3: choose delivery

### Email

```ts
import { resend } from "shotlog/server";
resend({ apiKey: process.env.RESEND_API_KEY! });

import { ses } from "shotlog/ses";
ses({ region: "ap-southeast-2" }); // standard AWS credential chain

import { smtp } from "shotlog/smtp";
smtp({ host: "smtp.example.com", port: 587, auth: { user, pass } }); // Node only
```

`email` takes `{ provider, from, to, labels? }`. The subject is `[Bug] SL-7F3K · first line of the description`. The HTML body shows the screenshot inline, attaches it as a PNG, and lists reporter, metadata, environment and diagnostics. If `reporter.email` is set, it becomes Reply-To. Email sends once with a 15 s timeout and no retry.

### Webhook

```ts
createSupportHandler({
  delivery: {
    webhook: {
      url: "https://example.com/hooks/shotlog",
      secret: process.env.SHOTLOG_WEBHOOK_SECRET!,
    },
  },
  authorize,
});
```

The webhook receives a POST with a JSON body and these headers:

- `x-shotlog-id`: the Support Log UUID
- `x-shotlog-signature`: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`

Each attempt times out after 10 s. Network errors and 5xx responses get two retries. Redirects are not followed.

### Slack

```ts
createSupportHandler({
  delivery: {
    slack: { token: process.env.SLACK_BOT_TOKEN!, channel: "C0123456789" },
  },
  authorize,
});
```

The token is a Slack app bot token with `chat:write` and `files:write`. Invite the app to the channel. The report posts as one Block Kit message, and the screenshot is shared as a reply in its thread. Reporter text is escaped, so it can't mention `@channel`.

`channel` can also map Type values to channels, like `{ Bug: "#bugs", Idea: "#ideas" }`. Mapped Types always go to their channel with no dropdown. Unmapped Types fall back to the reporter picking.

Leave out `channel` to let the reporter pick. The card then shows a "Slack channel" dropdown, filled from a `GET` to the same endpoint (it runs `authorize` first). It offers `channels` if you set it (IDs or names), otherwise every channel the app is in, which also needs `channels:read` and `groups:read`. The server rejects any channel it didn't offer.

Each Slack call times out after 5 s and gets two retries on network errors, 429 and 5xx. Slack errors like `not_in_channel` fail at once and are logged on the server.

Set any combination of `email`, `slack` and `webhook`. Each channel is tracked separately, so a retry resends only the channel that failed.

### Screenshot storage for webhooks

By default the webhook body carries the PNG as base64. To send a link instead:

```ts
import { uploadfile } from "shotlog/uploadfile";

webhook: {
  url,
  secret,
  screenshotMode: "upload",
  storage: uploadfile({ acl: "public-read" }), // reads UPLOADFILE_TOKEN
},
```

`acl: "private"` returns a signed URL that expires within 7 days. Store `screenshot.key` if you need to re-sign later. If an upload fails or takes over 10 s, shotlog falls back to base64 and sets `screenshot.uploadError`. For S3, R2 or similar, pass any object with `name` and `upload(png, { id, filename, signal }) => Promise<{ url, key }>`.

## Step 4: receive the webhook

Verify the signature against the raw body before parsing it.

```ts
import { verifyWebhookSignature } from "shotlog/server";

export async function POST(request: Request) {
  const payload = await request.text();
  const valid = await verifyWebhookSignature({
    payload,
    header: request.headers.get("x-shotlog-signature"),
    secret: process.env.SHOTLOG_WEBHOOK_SECRET!,
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  const log = JSON.parse(payload);
  if (await alreadyStored(log.id)) return new Response(null, { status: 204 });
  await store(log);
  return new Response(null, { status: 204 });
}
```

Delivery is at least once. Always dedupe on `log.id` or `x-shotlog-id`. The signature check rejects timestamps more than 300 s old or ahead.

## The Support Log payload

```json
{
  "schemaVersion": 1,
  "id": "0d9f2c1e-8c3b-4a7e-9f1d-2b6a5c4e8f10",
  "shortId": "SL-7F3K",
  "createdAt": "2026-09-29T10:12:03.120Z",
  "type": "Bug",
  "description": "Save does nothing on the billing page",
  "environment": {
    "url": "https://app.example.com/settings/billing",
    "route": "/settings/billing",
    "title": "Billing",
    "referrer": "",
    "timeOnPageMs": 48210,
    "userAgent": "Mozilla/5.0 ...",
    "browser": "Chrome 141",
    "os": "macOS",
    "deviceType": "desktop",
    "language": "en-AU",
    "timezone": "Australia/Sydney",
    "screen": { "width": 1512, "height": 982 },
    "viewport": { "width": 1440, "height": 900 },
    "devicePixelRatio": 2,
    "colorScheme": "light",
    "online": true,
    "libraryVersion": "1.0.0"
  },
  "reporter": { "id": "u_42", "email": "alex@example.com", "name": "Alex", "plan": "pro" },
  "metadata": { "appVersion": "2.4.1", "tenant": "acme" },
  "diagnostics": {
    "console": [{ "level": "error", "message": "TypeError: ...", "stack": "...", "at": "2026-09-29T10:11:58.001Z" }],
    "network": [{ "method": "POST", "url": "https://api.example.com/billing", "status": 500, "at": "2026-09-29T10:11:57.410Z" }]
  },
  "screenshot": {
    "_tag": "Inline",
    "data": "<base64 PNG>",
    "width": 2880,
    "height": 1800,
    "size": 141783,
    "mimeType": "image/png"
  }
}
```

`screenshot` is optional. In upload mode it is `{ "_tag": "Uploaded", "url", "key", ... }`. Validate payloads with `shotlog/schema.json`.

shotlog collects `environment` and `diagnostics` automatically. It strips query strings, fragments and credentials from URLs. Diagnostics keep the last 50 console errors and warnings and the last 50 failed requests. They never include request bodies or headers.

## Delivering it yourself

Skip the server endpoint with `onSubmit`:

```tsx
<ShotlogProvider
  onSubmit={async ({ log, screenshot }) => {
    await api.createTicket(log, screenshot);
  }}
/>
```

Throw a shotlog error class, such as `new RateLimited(60)`, to show that error's message. Any other throw shows as a delivery failure.

## Errors

Every error is a plain `Error` subclass with a `_tag`. Narrow on `_tag` or use `instanceof`.

| `_tag` | HTTP | Meaning |
| --- | --- | --- |
| `Unauthorized` | 401 | `authorize` threw `Unauthorized` |
| `Forbidden` | 403 | `authorize` returned `false` |
| `RateLimited` | 429 | Too many reports. Has `retryAfterSeconds` |
| `PayloadTooLarge` | 413 | Over a size limit. Has `limitBytes` |
| `ValidationFailed` | 400 | Invalid submission. Has `issues` |
| `DeliveryFailed` | 502 | A channel failed. Has `channel` |
| `UploadFailed` | 502 | Storage upload failed |
| `Offline` | none | Browser offline, network failure, or no response in 60 s |
| `ProviderNotInstalled` | none | Missing peer package. Has `installCommand` |
| `UnsupportedRuntime` | none | For example SMTP outside Node |

## What users can do in the widget

- Pick a type and write a description. The description is required, up to 10,000 characters.
- Attach one screenshot. Options are capture the page, capture the page after a 5-second countdown (so an open menu or hover state shows), capture the exact screen (desktop browsers that support screen sharing), or paste or upload an image.
- Annotate in a full-screen editor. Tools and shortcuts: select V, arrow A, rectangle R, oval O, text T, freehand P, highlighter H, numbered step N, spotlight S, pixelate or solid redact X, crop C. It has undo, redo, colours and three sizes.
- Review everything that will be sent under "Included details" before submitting.
- Resize the card by dragging its free corner.

Redaction changes the real pixels in the exported PNG. The unredacted original never leaves the browser. Solid redaction is the strongest option.

## Checklist

1. `npm i shotlog`, plus a peer package if needed.
2. Wrap the app in `ShotlogProvider` with `endpoint` and `enabled`.
3. Add a POST route with `createSupportHandler`. Set `authorize`, `delivery` and `ipHeader` for your platform.
4. Keep API keys and webhook secrets in server environment variables only.
5. For webhooks, verify `x-shotlog-signature` on the raw body and dedupe on `id`.
6. Submit a test report and confirm it arrives.
