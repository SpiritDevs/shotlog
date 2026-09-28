# shotlog

A React library for in-app support reports: describe a problem, attach an annotated Screenshot, and submit a Support Log.
Your Host App controls access and delivers reports through its own backend.

- **Report Card:** Type, Description, optional Screenshot, and an Included Details preview.
- **Shottr-style Annotation Editor:** full-viewport editing with arrows, shapes, text, redaction, and keyboard shortcuts.
- **Diagnostic Trail:** recent console warnings/errors and failed network requests.
- **Email, Slack, and Webhook delivery:** Resend, Amazon SES, SMTP, a Slack channel (fixed, or chosen by the Reporter), or signed JSON webhooks; combine any of them.
- **Security:** server-owned destinations, an Authorize Hook, rate limits, bounded requests, and schema validation.

## Install

```sh
npm i shotlog
```

ESM-only. Requires Node **≥20.19** for Node deployments and React / React DOM **≥18** for the client. Fetch-compatible runtimes can use the Server Helper. Install only the optional peers you use:

| Provider | Install | Import |
| --- | --- | --- |
| Resend | No extra dependency | `resend` from `shotlog/server` |
| Amazon SES | `npm i @aws-sdk/client-sesv2` | `ses` from `shotlog/ses` |
| SMTP (Node only) | `npm i nodemailer` | `smtp` from `shotlog/smtp` |
| UploadFile storage | `npm i @uploadfile/core` | `uploadfile` from `shotlog/uploadfile` |

## Quick start: Next.js App Router

Create `app/providers.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { ShotlogProvider } from "shotlog";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ShotlogProvider endpoint="/api/support">
      {children}
    </ShotlogProvider>
  );
}
```

Wrap your app in `app/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
```

Create `app/api/support/route.ts`. Set `RESEND_API_KEY`, `SUPPORT_FROM` (a sender accepted by your provider), and `SUPPORT_TO` in server environment variables.

```ts
import { createSupportHandler, resend } from "shotlog/server";

export const runtime = "nodejs";

export const POST = createSupportHandler({
  delivery: {
    email: {
      provider: resend({ apiKey: process.env.RESEND_API_KEY! }),
      from: process.env.SUPPORT_FROM!,
      to: process.env.SUPPORT_TO!,
    },
  },
  // Local development only. Replace with your session check before production.
  authorize: () => process.env.NODE_ENV === "development",
  ipHeader: "x-real-ip", // For deployment behind Vercel; see platform guidance below.
});
```

Start your Next.js app, open the Launcher, and submit a Description. No CSS import is needed. The development hook above denies production requests; connect your Host App's authentication using the [security example](#security) before deploying. Keep keys and destinations out of client components and `NEXT_PUBLIC_*` variables.

## Quick start: Vite + Express

This complete local example uses a signed Webhook. Start in an empty directory with Node ≥20.19:

```sh
npm init -y
npm pkg set type=module
npm i react react-dom shotlog express
npm i -D vite typescript tsx @types/react @types/react-dom @types/express @types/node
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "noEmit": true,
    "lib": ["ES2022", "DOM"], "types": ["node"], "esModuleInterop": true
  },
  "include": ["*.ts", "*.tsx"]
}
```

Create `vite.config.ts`. The proxy keeps the browser's `/api/support` request on the same origin:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1", port: 5410, strictPort: true,
    proxy: { "/api": "http://127.0.0.1:5411" },
  },
});
```

Create `server.ts`. Mount the raw-stream handler **before** Express body parsers. Set the destination and signing secret only on this server:

```ts
import express from "express";
import { toNodeHandler } from "shotlog/node";
import { createSupportHandler } from "shotlog/server";

const url = process.env.SHOTLOG_WEBHOOK_URL;
const secret = process.env.SHOTLOG_WEBHOOK_SECRET;
if (!url || !secret) throw new Error("Set SHOTLOG_WEBHOOK_URL and SHOTLOG_WEBHOOK_SECRET");

const app = express();
app.post("/api/support", toNodeHandler(createSupportHandler({
  delivery: { webhook: { url, secret } },
  authorize: async (request) => {
    // TODO: Verify your Host App session and allowed origin here, then return
    // { reporterId: session.user.id }. Never trust the submitted reporter.id.
    // This placeholder denies access unless explicitly enabled for local development.
    return process.env.NODE_ENV === "development"
      && process.env.SHOTLOG_LOCAL_DEMO === "1"
      && request.headers.get("origin") === "http://127.0.0.1:5410";
  },
})));
app.use(express.json()); // Other application routes can use parsed bodies.
app.listen(5411, "127.0.0.1", () => console.info("Relay listening on 5411"));
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Support demo</title></head>
  <body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>
```

Create `main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShotlogProvider } from "shotlog";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShotlogProvider endpoint="/api/support" draftScope="local-demo">
      <h1>My app</h1>
      <p>Open “Report an issue” to send a Support Log.</p>
    </ShotlogProvider>
  </StrictMode>,
);
```

In one terminal, set your receiver URL and its shared secret, then start Express:

```sh
SHOTLOG_WEBHOOK_URL=https://your-receiver.example/support \
SHOTLOG_WEBHOOK_SECRET=replace-with-your-server-side-secret \
NODE_ENV=development SHOTLOG_LOCAL_DEMO=1 npx tsx server.ts
```

In another terminal, run `npx vite` and open `http://127.0.0.1:5410`. Submit a Description; the receiver gets a signed JSON Support Log. Check types with `npx tsc` and build the client with `npx vite build`. Replace the local authorization placeholder with your session check and set `draftScope` to the signed-in user's ID before deployment. In production, serve `/api` through your backend or reverse proxy; Vite's proxy is for development only.

## Other backends

Create the handler once per server instance so its in-memory limits and deduplication survive between requests.

### node:http, Express, and Fastify

`toNodeHandler` accepts Node's raw request and response streams. A `node:http` mount:

```ts
import { createServer } from "node:http";
import { toNodeHandler } from "shotlog/node";
import { createSupportHandler, type SupportHandlerConfig } from "shotlog/server";

export function supportServer(config: SupportHandlerConfig) {
  const handle = toNodeHandler(createSupportHandler(config));
  return createServer((request, response) => {
    if (request.url?.split("?")[0] === "/api/support") handle(request, response);
    else { response.statusCode = 404; response.end(); }
  });
}
```

Call the returned server's `listen` method. In Express, mount the adapter on `/api/support` before body-parsing middleware. In Fastify, intercept that route in an `onRequest` hook, call `reply.hijack()`, then pass `request.raw` and `reply.raw` to the adapter. The stream must still be unread; an ordinary handler after multipart parsing is too late.

### Hono, Bun, and Workers

Use the Fetch handler directly. Hono passes `context.req.raw` to it; Bun accepts it as its `fetch` handler. A Workers-style export can be built from the same configuration:

```ts
import { createSupportHandler, type SupportHandlerConfig } from "shotlog/server";

export function supportWorker(config: SupportHandlerConfig) {
  const handle = createSupportHandler(config);
  return {
    fetch(request: Request): Promise<Response> {
      return new URL(request.url).pathname === "/api/support"
        ? handle(request)
        : Promise.resolve(new Response(null, { status: 404 }));
    },
  };
}
```

Supply credentials through your runtime's server-side environment bindings. Use Resend or Webhook delivery for a minimal Fetch-only setup. SES needs its optional SDK; SMTP requires Node and rejects Bun, Deno, and edge runtimes.

### Client IP configuration

| Deployment | `ipHeader` |
| --- | --- |
| Vercel | `"x-real-ip"` |
| Cloudflare | `"cf-connecting-ip"` |
| nginx that appends the client address | `"x-forwarded-for"` |
| Direct Node server | Omit it; `toNodeHandler` supplies the socket address |

Trust only a header your proxy overwrites or appends. For `x-forwarded-for`, shotlog uses the **last** entry. It does not scan a header chain. `getClientIp(request)` overrides both `ipHeader` and the socket address. With no usable IP, per-IP limiting is skipped and a warning is logged once; authenticated Reporter limits still apply.

## Delivery

### Email

Set `delivery.email` with `from`, `to` (one address or an array), and a provider. Replace the quick-start provider with one of these:

```ts
import { resend } from "shotlog/server";
import { ses } from "shotlog/ses";
import { smtp } from "shotlog/smtp";

export const resendProvider = resend({ apiKey: process.env.RESEND_API_KEY! });
export const sesProvider = ses({ region: "ap-southeast-2" });
export const smtpProvider = smtp({
  host: "smtp.example.com", port: 465, secure: true,
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
});
```

SES uses the SDK's credential chain unless you supply `credentials` (an object or async function). Resend uses REST directly. Import only the provider you use.

Email includes HTML tables, a plain-text alternative, and the PNG inline and as an attachment. `reporter.email`, when supplied, is used for Reply-To. Customize template text with `delivery.email.labels` (`Partial<EmailLabels>`); `defaultEmailLabels` exports the English defaults.

Resend and SES abort sends after 15 seconds. SMTP has 15-second connection, greeting, and socket inactivity timeouts, with no total deadline. Email sends have no automatic retries. Custom `EmailProvider.send` implementations must bound their own duration; the Relay Endpoint waits for them to settle.

### Webhook

Configure a server-owned destination and shared secret:

```ts
import type { DeliveryConfig } from "shotlog/server";

export const delivery: DeliveryConfig = {
  webhook: {
    url: "https://support.example.com/shotlog",
    secret: process.env.SHOTLOG_WEBHOOK_SECRET!,
    timeoutMs: 10000,
  },
};
```

Every POST has `x-shotlog-id` (the full UUID) and `x-shotlog-signature: t=<unix-seconds>,v1=<hex-digest>`. The signature is HMAC-SHA256 over `<timestamp>.<raw JSON body>`. Failed network requests, timeouts, and HTTP 5xx responses retry up to twice; other non-2xx responses fail without retry. The default timeout is 10 seconds per attempt.

Verify the **raw body before JSON parsing**. This receiver factory leaves runtime schema validation and durable processing with the Host App:

```ts
import { verifyWebhookSignature, type SupportLog } from "shotlog/server";

export function webhookReceiver(
  secret: string,
  validate: (value: unknown) => SupportLog, // Validate with shotlog/schema.json.
  acceptOnce: (id: string, log: SupportLog) => Promise<void>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const payload = await request.text();
    const valid = await verifyWebhookSignature({
      payload, header: request.headers.get("x-shotlog-signature"), secret,
    });
    if (!valid) return new Response("Invalid signature", { status: 401 });
    let log: SupportLog;
    try { log = validate(JSON.parse(payload)); }
    catch { return new Response("Invalid Support Log", { status: 400 }); }
    const id = request.headers.get("x-shotlog-id");
    if (id !== log.id) return new Response("ID mismatch", { status: 400 });
    await acceptOnce(id, log);
    return new Response(null, { status: 204 });
  };
}
```

`acceptOnce` must atomically dedupe and durably store or enqueue the report; an existing ID should succeed. Comparing the header to the signed body's `id` prevents deduplication using an unsigned replacement ID. Signature verification allows 300 seconds of clock skew in either direction by default (`toleranceSeconds` changes it).

### Slack

Create a Slack app, add a bot token with the `chat:write` and `files:write` scopes, install it, and invite it to the channels it should post to. Then set `delivery.slack`:

```ts
import type { DeliveryConfig } from "shotlog/server";

// Every report goes to one channel (an ID, or a name like "#support"):
export const fixed: DeliveryConfig = {
  slack: { token: process.env.SLACK_BOT_TOKEN!, channel: "C0123456789" },
};

// No channel: the Report Card shows a "Slack channel" dropdown.
export const reporterChooses: DeliveryConfig = {
  slack: { token: process.env.SLACK_BOT_TOKEN!, channels: ["#support", "#bugs"] },
};
```

Each report is one message: the Type and Reference, the Description, the Reporter, page, browser and viewport, Metadata, and the last few Diagnostic Trail entries. The Screenshot is uploaded first and shared as a reply in the message's thread. Reporter text is escaped, so `<!channel>` and similar mentions never ping anyone.

Without `channel`, the Report Card asks the Relay Endpoint (`GET`, behind your Authorize Hook) which channels to offer, and shows them in a dropdown. The list is `channels` when set, otherwise every channel the app is a member of; listing needs the `channels:read` and `groups:read` scopes. The Relay Endpoint rejects any channel it did not offer, so a Reporter can't post anywhere else. The list is cached for a minute. Any Reporter who passes `authorize` can see the offered channel names, so prefer setting `channels` to exactly the ones you want offered.

Each Slack API call times out after 5 seconds (`timeoutMs`) and retries twice on network errors, timeouts, HTTP 429, and 5xx. Slack errors such as `not_in_channel` or `missing_scope` fail without retry and are logged on the server. If the message posts but sharing the Screenshot fails, the report still counts as delivered, so a retry can't post it twice; the failure is logged.

### Several at once

```ts
import { resend, type DeliveryConfig } from "shotlog/server";

export const delivery: DeliveryConfig = {
  email: {
    provider: resend({ apiKey: process.env.RESEND_API_KEY! }),
    from: process.env.SUPPORT_FROM!, to: process.env.SUPPORT_TO!,
  },
  webhook: {
    url: "https://support.example.com/shotlog",
    secret: process.env.SHOTLOG_WEBHOOK_SECRET!,
  },
};
```

Pass this as `createSupportHandler`'s `delivery`. Add `slack` alongside them too. Every configured channel is attempted; a retry skips channels already recorded as delivered.

**Delivery is at least once. Dedupe on `x-shotlog-id` / `log.id`.** Delivered-ID records last 24 hours. Lost acknowledgements, racing instances, expiry, eviction, and restarts can produce duplicates. A shared `ShotlogStore` reduces repeats across instances but cannot guarantee exactly-once delivery.

### Screenshot storage

Browser → Relay Endpoint uses multipart JSON plus a binary PNG. Email always embeds and attaches the PNG. Webhooks default to `screenshotMode: "base64"`, embedding the PNG in JSON as an `Inline` Screenshot.

Use `"upload"` and a Storage Adapter to send an `Uploaded` Screenshot containing a URL and storage key:

```ts
import type { WebhookConfig } from "shotlog/server";
import { uploadfile } from "shotlog/uploadfile";

export const webhook: WebhookConfig = {
  url: "https://support.example.com/shotlog",
  secret: process.env.SHOTLOG_WEBHOOK_SECRET!,
  screenshotMode: "upload",
  storage: uploadfile({ acl: "private", signedUrlExpiresIn: 3600 }),
};
```

Set `UPLOADFILE_TOKEN` on the server, or pass `token` explicitly. The default ACL is `public-read`: anyone with the URL can view the Screenshot while the file exists.

**Private UploadFile links expire within 7 days.** `signedUrlExpiresIn` is a positive integer in seconds, defaulting to and capped at `604800`. Private signed URLs are generated once per Support Log and reused across webhook retries. A delayed successful delivery may carry a URL closer to expiry, so receivers should store `key` and re-sign when needed.

TypeScript requires `storage` in upload mode and excludes it in base64 mode. JavaScript upload configurations without storage also throw at handler creation. Uploads have a 10-second deadline; failures fall back to inline base64 with a sanitized `screenshot.uploadError`. That fallback may exceed a receiver's body-size limit. No Screenshot means no upload.

For custom storage, implement `StorageAdapter` and honor the abort signal. This example assumes your own storage service accepts PNG PUTs and serves the same URL on GET; add its server-side authentication as needed:

```ts
import type { StorageAdapter } from "shotlog/server";

export const storage: StorageAdapter = {
  name: "internal-screenshots",
  async upload(png, { id, filename, signal }) {
    const key = `${id}/${filename}`;
    const url = `https://files.example.com/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
    const response = await fetch(url, {
      method: "PUT", body: new Uint8Array(png), signal,
      headers: { "content-type": "image/png" },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Screenshot upload failed");
    return { url, key };
  },
};
```

## Security

Hiding the Launcher with `enabled` is a UI choice. Protect the Relay Endpoint with an **Authorize Hook** backed by your Host App's session. For example, pass your session lookup and delivery configuration into this factory:

```ts
import { createSupportHandler, Unauthorized, type DeliveryConfig } from "shotlog/server";

type Session = { user: { id: string; canReport: boolean } };

export function authenticatedSupportHandler(
  delivery: DeliveryConfig,
  getSession: (request: Request) => Promise<Session | null>,
) {
  return createSupportHandler({
    delivery,
    authorize: async (request) => {
      const session = await getSession(request);
      if (!session) throw new Unauthorized(); // 401
      if (!session.user.canReport) return false; // 403
      return { reporterId: session.user.id };
    },
    ipHeader: "x-real-ip", // Select the header for your actual proxy.
    rateLimit: { max: 5, windowSeconds: 600 },
    limits: { screenshotBytes: 5 * 1024 * 1024, concurrentRequests: 16 },
  });
}
```

- `authorize` runs before reading the body. `true` allows; `false` denies with 403; throwing `Unauthorized` / `Forbidden` produces 401 / 403. `{ reporterId }` also enables per-Reporter limiting using authenticated identity. Body-supplied `reporter.id` is untrusted Host Context.
- Omitting `authorize` **accepts unauthenticated reports** and logs a warning when the handler is created.
- Default limits are **5 requests per 10 minutes**, independently per IP and authenticated Reporter. `rateLimit: false` disables both. The bounded in-memory store protects one handler instance; supply an atomic, expiring `ShotlogStore` for multiple instances.
- `limits.concurrentRequests` defaults to **16** per handler. Overflow returns 429 with a 5-second retry delay before reading the body. Aborted bodies and bodies taking longer than 30 seconds release their admission slot.
- Destinations and credentials come only from server configuration. Clients cannot choose recipients or webhook URLs.

Always-on schema and size checks reject invalid requests before delivery:

| Limit | Value |
| --- | --- |
| PNG | 5 MiB by default; configurable with `limits.screenshotBytes` |
| JSON part | 256 KiB |
| Multipart framing allowance | 16 KiB |
| Description | 1–10,000 characters; the Report Card requires non-whitespace text |
| Type | 1–40 characters |
| Reporter / metadata | 16 KiB serialized UTF-8 JSON each |
| Diagnostic Trail | Up to 50 console entries and 50 network entries |

See [ADR-0008](../../docs/adr/0008-relay-endpoint-abuse-protection.md) for the complete policy.

## Client options

**Standalone Mode** is the default: mount `ShotlogProvider` and use its floating Launcher, a round support-icon button in the chosen corner. Show text or your own icon with `launcher={{ content: "icon" | "text" | "icon-text", icon }}`; its accessible name is always `labels.launcher`. For **Programmatic Mode**, set `launcher={false}` and call `useShotlog` from a descendant:

```tsx
"use client";
import { ShotlogProvider, useShotlog } from "shotlog";

function HelpButton() {
  const { open, isOpen } = useShotlog();
  return <button onClick={open} disabled={isOpen}>Report a problem</button>;
}

export function Support() {
  return (
    <ShotlogProvider endpoint="/api/support" launcher={false}>
      <HelpButton />
    </ShotlogProvider>
  );
}
```

The hook also exposes `close()` and `clearDraft()`. Closing preserves the draft and does not cancel an active submission; clearing removes the current scope's stored draft, identity, and Screenshot. Type, Description, and pending ID survive reloads in `sessionStorage` by default; use `draftScope` for account isolation or `persistDraft={false}` for memory-only drafts. Screenshots stay in memory only. Success clears the draft and closes the card after about 3 seconds. There is no offline queue.

| Option | Behavior |
| --- | --- |
| `enabled` | Default `true`; `false` removes the UI, stops this provider's recording, and makes `open()` a no-op. Children remain rendered. |
| `position` | Where the Launcher sits and the card is anchored: `"bottom-right"` (default), `"bottom-left"`, `"bottom-center"`, `"top-left"`, `"top-center"`, `"top-right"`, or `"center"`. Programmatic Mode anchors the card the same way; `"center"` is intended mainly for it. The card grows away from its anchor, and a handle at the opposite corner resizes it (arrow keys move the handle by 16 px, Shift for 64 px); the chosen size lasts while the page lives. |
| `theme`, `accent` | `"auto"` (default), `"light"`, or `"dark"`; accent accepts a CSS color. |
| `types` | `readonly ShotlogTypeOption[]`: strings or `{ value, label? }`. Explicit labels win; otherwise Bug/Question/Idea use translated labels, and other values label themselves. Only `value` is delivered. `[]` hides chips and submits Bug. |
| `draftScope` | Pass the signed-in user's ID. Uses `shotlog:draft:<scope>` in `sessionStorage`, or `shotlog:draft` when omitted. Switching scope resets memory and loads only that scope's draft and pending ID. |
| `persistDraft` | Defaults to `true`. Set `false` to keep drafts and pending IDs in memory only. |
| `labels` | `Partial<ShotlogLabels>` overrides English Launcher, Report Card, and Annotation Editor text, including function-valued messages. |
| `reporter`, `metadata` | JSON objects or sync/async functions; functions run when Included Details expands and again on every submit attempt. |
| `diagnostics` | Both channels on by default. Use `false` or `{ console: false, network: true }`; omitted flags default to `true`. |
| `shortcut` | Off by default. For example, `"Mod+Shift+."`; Mod means Cmd on macOS and Ctrl elsewhere. |
| `onSubmitted` | Receives `{ id, shortId, duplicate }` after Relay acknowledgement or custom `onSubmit` resolution. |
| `onError` | Receives a tagged `ShotlogError` for a failed submission attempt. |

For example:

```tsx
import { ShotlogProvider } from "shotlog";

export function SupportOptions({ userId }: { userId: string }) {
  return (
    <ShotlogProvider
      endpoint="/api/support"
      position="bottom-left" theme="auto" accent="#4338ca"
      draftScope={userId}
      types={["Bug", "Question", { value: "Billing", label: "Billing help" }]}
      labels={{ submit: "Send report", sent: (id) => `Sent · ${id}` }}
      reporter={() => ({ id: userId })}
      metadata={async () => ({ appVersion: "1.0.0" })}
      diagnostics={{ console: true, network: false }}
      shortcut="Mod+Shift+."
      onSubmitted={(result) => console.info(result.shortId)}
      onError={(error) => console.info(error._tag)}
    />
  );
}
```

The UI lives in a Shadow DOM. Set inheritable CSS variables on `:root` or `[data-shotlog]` (the host is appended to `document.body`, outside your React wrapper): `--shotlog-accent`, `--shotlog-accent-text`, `--shotlog-radius`, `--shotlog-control-radius`, `--shotlog-font`, `--shotlog-font-size`, `--shotlog-surface`, `--shotlog-text`, `--shotlog-muted`, `--shotlog-border`, `--shotlog-field`, `--shotlog-focus`, `--shotlog-offset`, `--shotlog-card-width`, and `--shotlog-z-index`. The `accent` prop takes precedence over an inherited accent variable.

### Custom delivery

Choose **either** `endpoint` **or** `onSubmit`. A custom callback receives `{ log, screenshot? }` and resolves `Promise<void>` after your backend accepts it. Keep provider credentials on that backend; it owns authorization, validation, limits, and deduplication.

```tsx
import { DeliveryFailed, ShotlogProvider, type ShotlogProviderProps } from "shotlog";

const onSubmit: NonNullable<ShotlogProviderProps["onSubmit"]> = async ({ log, screenshot }) => {
  const body = new FormData();
  body.set("supportLog", JSON.stringify(log));
  if (screenshot) body.set("screenshot", screenshot, "screenshot.png");
  const response = await fetch("/api/custom-support", { method: "POST", body });
  if (!response.ok) throw new DeliveryFailed("custom");
};

export function CustomSupport() {
  return <ShotlogProvider onSubmit={onSubmit} />;
}
```

Do not set multipart `Content-Type` yourself; the browser supplies the boundary. Throw a public error class to select its translated UI message. Other failures become `DeliveryFailed("custom")`. A custom callback's success result always has `duplicate: false`.

## Screenshots and the Annotation Editor

One optional Screenshot per Support Log. Capture or upload opens the full-viewport Annotation Editor; **Done** returns a flattened PNG to the Report Card.

| Capture Method | What to expect |
| --- | --- |
| **Page Render** | Default, permission-free DOM reconstruction of the current viewport. Video and all iframes are omitted; cross-origin images without CORS, canvas/WebGL, and some CSS effects may differ or fail. |
| **Capture in 5 seconds** | Page Render after a countdown. The card steps aside so the Reporter can open a menu or hover state first; Esc or Cancel stops it. |
| **Screen Capture** | “Capture exact screen” uses `getDisplayMedia` and prompts for a surface. Offered only when the API exists; generally unavailable on mobile, including iOS Safari. Choose the intended tab/window/screen. |
| **Paste / Upload** | Supply an image from the clipboard or file picker; shotlog converts it to PNG. |

The widget hides during Page Render and Screen Capture. Large captures and exports are downscaled to keep PNGs within the client's 4 MiB budget; the server's default cap is 5 MiB.

| Tool | Shortcut | Action |
| --- | --- | --- |
| Select / Move | V | Select, move, or resize an Annotation |
| Arrow | A | Draw a tapered arrow; drag its middle handle to curve it |
| Rectangle | R | Draw a rectangle; optional rounded corners |
| Oval | O | Draw an ellipse |
| Text | T | Add a text label on a coloured pill; Enter commits, Shift+Enter adds a line |
| Freehand | P | Draw a freehand stroke |
| Highlighter | H | Highlight an area with a stroke |
| Step Counter | N | Place incrementing numbered markers |
| Spotlight | S | Dim the area outside a rectangle |
| Pixelate / Redact | X | Coarse pixelation or Solid fill |
| Crop | C | Select bounds, then Apply crop |

| Action | Shortcut |
| --- | --- |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z |
| Copy / paste selected Annotation | Ctrl/Cmd+C / Ctrl/Cmd+V (editor-local clipboard) |
| Duplicate while moving | Alt/Option+drag |
| Nudge selected Annotation | Arrow keys; Shift for 10 pixels |
| Delete selected Annotation | Delete / Backspace |
| Keep drawing with the same tool | Hold ⌘ or Shift when you finish a shape; otherwise the editor returns to Select with the new shape selected |
| Done | Ctrl/Cmd+Enter; Enter when the canvas or stage is focused |
| Cancel | Esc (confirms when there are edits) |

Tool keys do not replace normal text input. **Solid is the strongest redaction option:** cover secrets fully before submitting. Pixelation hides detail but retains coarse visual information; Highlighter and Spotlight are not redaction. Redactions are baked into the PNG; the editable original is kept in the browser and never submitted.

## The Support Log payload

`SupportLog` is exported as a TypeScript type from `shotlog`, `shotlog/server`, and `shotlog/node`. Webhooks receive it directly, without an envelope:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Currently `1` |
| `id`, `shortId`, `createdAt` | Full UUID, readable `SL-` ID, and ISO timestamp for the report identity |
| `type`, `description` | Reporter-selected Type and Description |
| `environment` | Page, browser, OS/device, locale/timezone, screen/viewport, online status, and library version |
| `reporter?`, `metadata?` | Host Context containing JSON values |
| `diagnostics?` | Console warnings/errors and failed network requests |
| `screenshot?` | `Inline` base64 or `Uploaded` URL/key, with PNG dimensions, byte size, and optional upload error |

The browser sends `SupportLogSubmission` (the same shape without `screenshot`) plus the PNG as a separate multipart part. Use the **published JSON Schema at `shotlog/schema.json`** for receiver validation. Its `x-maxSerializedBytes` extension and short-ID derivation comment describe additional runtime checks that generic JSON Schema validators do not automatically enforce. `getShortId(id)` from `shotlog/server` or `shotlog/node` derives the short ID; dedupe on the full UUID because short IDs can collide.

Example webhook body, **truncated** (Environment fields and PNG data omitted):

```json
{
  "schemaVersion": 1,
  "id": "00000000-0000-4000-8000-000000000001",
  "shortId": "SL-0001",
  "createdAt": "2026-09-28T10:00:00.000Z",
  "type": "Bug",
  "description": "Save does nothing on the settings page.",
  "environment": { "url": "https://app.example.com/settings", "route": "/settings" },
  "reporter": { "id": "user-42" },
  "metadata": { "appVersion": "1.0.0" },
  "diagnostics": { "console": [], "network": [] },
  "screenshot": { "_tag": "Inline", "mimeType": "image/png", "width": 800, "height": 600, "size": 42000, "data": "…" }
}
```

## Errors

Public errors are ordinary `Error` subclasses, exported from `shotlog`, `shotlog/server`, and `shotlog/node`. `ShotlogError` is their discriminated union; no Effect types are needed.

| Class / `_tag` | Useful field or meaning |
| --- | --- |
| `Unauthorized`, `Forbidden` | Authentication required / access denied |
| `RateLimited` | `retryAfterSeconds` |
| `PayloadTooLarge` | `limitBytes` |
| `ValidationFailed` | `issues` |
| `DeliveryFailed` | `channel`: `"email"`, `"webhook"`, `"slack"`, or `"custom"` |
| `UploadFailed` | Storage upload failed; the Server Helper normally falls back to base64 |
| `Offline` | Browser offline or Relay network request failed |
| `ProviderNotInstalled` | `packageName`, `installCommand` |
| `UnsupportedRuntime` | Feature unavailable in the current runtime |

```ts
import { RateLimited, type ShotlogError } from "shotlog";

export function describeError(error: ShotlogError): string {
  switch (error._tag) {
    case "RateLimited": return `Retry in ${error.retryAfterSeconds} seconds`;
    case "ValidationFailed": return error.issues.join("; ");
    case "DeliveryFailed": return `${error.channel} delivery failed`;
    default: return error.message;
  }
}

export function retryDelay(error: unknown): number | undefined {
  return error instanceof RateLimited ? error.retryAfterSeconds : undefined;
}
```

`onError` receives the typed union; a caught `unknown` needs an `instanceof` check first. Relay errors become HTTP responses (400/401/403/413/429/502), with unexpected failures reported as generic 500s. Provider misconfiguration details are logged server-side and reported to the client as delivery failures. Invalid handler settings can throw `TypeError` during setup.

## Privacy

- **Automatic:** Environment and, while enabled, a Diagnostic Trail of up to 50 console warnings/errors and 50 failed fetch/XHR requests. Console `Error` arguments can include stack traces. Older diagnostics may be trimmed to fit the payload budget.
- **Not collected by the network recorder:** request/response bodies, headers, cookies, or successful requests. It excludes the configured Relay Endpoint. No continuous screen recording, audio, or keystroke log is collected. A Screenshot is captured only when the Reporter chooses it.
- **URL stripping:** Environment URLs/referrers remove query strings and embedded username/password credentials; their fragments remain. Network URLs additionally remove fragments. Console messages/stacks, Description, Host Context, URL paths, and Screenshot pixels are not automatically scrubbed for secrets.
- **Host Context:** shotlog does not infer a user from your auth system. Only supply Reporter/metadata fields you intend to send. Included Details previews context and diagnostics; submit resolves current values again.
- **Retention:** Type, Description, and pending ID use tab-scoped `sessionStorage`, scoped by `draftScope` when supplied. Pass the signed-in user's ID so accounts never share drafts; switching scope drops in-memory state and loads that scope's draft. `persistDraft={false}` disables storage reads and writes. Screenshots and editable originals are always memory-only. Your Email Provider, Webhook receiver, and Storage Adapter determine retention after delivery.

Call `clearDraft()` from `useShotlog()` **before signing out** to clear the current scope's stored draft, pending ID, and in-memory Screenshot. It also discards updates from pending capture/submission work; a request already sent to the backend can still be delivered.

```tsx
import { useShotlog } from "shotlog";

export function SignOut({ signOut }: { signOut: () => Promise<void> }) {
  const { clearDraft } = useShotlog();
  return <button onClick={async () => { clearDraft(); await signOut(); }}>Sign out</button>;
}
```

Use `diagnostics={false}` or disable individual channels when those sources may contain sensitive data. Inspect the Screenshot and use Solid redaction before submitting.

## Agent skill

AI coding agents can install a short guide to shotlog as a skill:

```sh
mkdir -p ~/.claude/skills/shotlog
curl -fsSL https://shotlog.dev/skills/shotlog/SKILL.md -o ~/.claude/skills/shotlog/SKILL.md
```

The source is [`skills/shotlog/SKILL.md`](https://github.com/SpiritDevs/shotlog/blob/main/skills/shotlog/SKILL.md).

## Development

From the repository root:

```sh
pnpm install
pnpm dev                 # Playground and its local backend
pnpm build
pnpm typecheck
pnpm lint
pnpm test                # Unit, integration, and type-level tests
pnpm e2e                 # Playwright browser tests (install browsers first)
pnpm api:update          # Regenerate public API reports after intentional changes
pnpm api:check
pnpm check:no-effect-dts
```

The [Playground](../../apps/playground) includes a local SMTP catcher and Webhook inbox; no Docker is required. See [the design docs](../../docs) and [CONTEXT.md](../../CONTEXT.md) for the glossary and architectural decisions.
