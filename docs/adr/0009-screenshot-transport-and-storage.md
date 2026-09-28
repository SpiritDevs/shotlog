# ADR-0009: How the Screenshot travels and where it's stored

**Status:** Accepted, 2026-09-28

## Context
A flattened Screenshot is roughly 0.5–3 MB. Each leg of the journey (browser → Relay Endpoint → Email / Webhook) has different constraints. Some webhook receivers cap body size at about 1 MB.

## Decision

### Browser → Relay Endpoint
Sent as `multipart/form-data`: one JSON part holding the Support Log, and one binary part holding the PNG. No base64 on this leg.

### Email
- The Screenshot is embedded inline in the HTML body (CID) **and** attached as a PNG.
- Environment, Host Context, and Diagnostic Trail are rendered as HTML tables, with a plain-text alternative.

### Webhook
The **Screenshot Mode** can be set to one of:
- **`base64`** (default): the PNG is embedded in the JSON body as `{ _tag: "Inline", data, width, height, size, mimeType }`. This needs no extra infrastructure.
- **`upload`**: the Server Helper uploads the PNG through a **Storage Adapter** and sends `{ _tag: "Uploaded", url, key, width, height, size, mimeType }`. `size` is the PNG byte length; `mimeType` is `"image/png"`.
  - Set `delivery.webhook.screenshotMode: "upload"` and `delivery.webhook.storage`. Upload mode without storage throws `TypeError` when the handler is created.
  - The built-in adapter is `uploadfile()` from **`shotlog/uploadfile`**, for the in-house UploadFile service (`../uploadfile`, production at `https://www.uploadfile.dev`). It uses `UFApi` and `UFFile` from `@uploadfile/core/server` (0.2.0).
  - `token` defaults to `process.env.UPLOADFILE_TOKEN`, read when `uploadfile()` is called. A missing token fails the upload and uses the inline fallback.
  - The public `StorageAdapter` interface in `shotlog/server` permits custom S3, R2, etc. implementations, with no Effect or SDK types:

    ```ts
    interface StorageAdapter {
      readonly name: string;
      upload(
        png: Uint8Array,
        info: { id: string; filename: string; signal: AbortSignal },
      ): Promise<{ url: string; key: string }>;
    }
    ```

  - Custom adapters **must honour `signal`**, cancelling their underlying work on abort.
- UploadFile adapter behaviour:
  - Upload a PNG `UFFile` with the handler's `support-log-<id>.png` filename and `{ type: "image/png", customId: <supportLogId> }`, using `uf.uploadFiles(file, { acl, signal })`.
  - `uploadFiles` returns `{ data, error }` rather than throwing on upload failures, and it polls for up to 10 minutes. A returned error becomes an `UploadFailed` rejection.
  - The handler applies a fixed **10-second deadline** to the complete storage operation, including SDK loading and private URL signing. It aborts the adapter signal on timeout. The UploadFile adapter also binds the SDK's fetch to that signal because `getSignedURL` has no signal parameter.
  - If storage fails or times out, the webhook **falls back to `Inline`** with `screenshot.uploadError` set to `"Screenshot upload failed"` or `"Screenshot upload timed out"`. Provider messages, credentials, and internal details never enter this field. Invalid adapter results (including non-HTTP(S) URLs or an empty key) also fall back to `Inline`, with `uploadError: "Storage adapter returned an invalid result"`. Storage failure does not prevent Support Log delivery.
  - The screenshot is prepared once per webhook delivery, outside its HTTP retries and after the handler's delivered-ID check. Concurrent submissions on the same handler coalesce. An already-delivered webhook never re-uploads, even when only email needs retrying. As with delivery itself, separate instances racing or a later retry after failed webhook delivery can upload again.
  - Email always embeds and attaches the original PNG. No Screenshot means no upload; base64 mode ignores storage.
  - `@uploadfile/core` is an optional peer and a development dependency. Only the `shotlog/uploadfile` entry imports its SDK, lazily at upload time; a missing SDK rejects with `ProviderNotInstalled` and an install hint. Importing only `shotlog/server` bundles without the SDK installed.

Every webhook request signs its actual JSON body with HMAC-SHA256 in `x-shotlog-signature: t=<timestamp>,v1=<digest>`, using a shared secret held on the server. Receivers can use `verifyWebhookSignature` to verify it and dedupe on `x-shotlog-id` / `log.id`.

### UploadFile access policy
- **Default: `public-read`.** Return `data.ufsUrl` and `data.key`. Anyone with the URL can view the image; the URL has no signing expiry and remains usable while the file exists.
- **Option: `acl: "private"`.** Return the `ufsUrl` from `getSignedURL(key, { expiresIn })` and the same key. `signedUrlExpiresIn` is a positive integer in seconds, defaulting to and capped at **604800 (7 days)**. Invalid values throw `TypeError` at adapter creation. **These links expire.** Private signed URLs are generated once per Support Log and reused across webhook retries. A delayed successful delivery may carry a URL closer to expiry, so receivers should store `key` and re-sign when needed.
- **Later enhancement:** keep the file private and give the webhook a permanent Screenshot Link on the Relay Endpoint (`/screenshot/<key>`). Opening it runs the Authorize Hook, then redirects to a fresh short-lived signed URL.

## Consequences
- The default setup works out of the box. The `upload` mode keeps webhook bodies small for strict receivers.
- Fallback retains the original PNG and may exceed a strict receiver's body-size limit; webhook delivery retains its normal failure and retry behaviour.
- The Playground can try upload mode with `SHOTLOG_SCREENSHOT_MODE=upload`, only when `UPLOADFILE_TOKEN` is also set. Otherwise it keeps base64 delivery.
- Uploaded Screenshots may sit at public (if unguessable) URLs. The redaction and size-cap rules in ADR-0005 and ADR-0008 matter even more here. Private or expiring links should be used where the provider supports them.
