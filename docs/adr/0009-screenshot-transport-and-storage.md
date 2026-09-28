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
- **`base64`** (default): the PNG is embedded in the JSON body as `screenshot.data`. This needs no extra infrastructure.
- **`upload`**: the Server Helper uploads the PNG through a **Storage Adapter** and puts only `screenshot.url` in the JSON.
  - The built-in adapter is **UploadFile**, the in-house service (`../uploadfile`, production at `https://www.uploadfile.dev`). It uses the `@uploadfile/core` npm package, specifically `UFApi` from `@uploadfile/core/server`, and needs only `UPLOADFILE_TOKEN` to configure.
  - The Storage Adapter interface is public, so S3, R2, etc. can be added.
- UploadFile adapter behaviour:
  - Upload with `new UFFile([png], "support-log-<id>.png", { type: "image/png", customId: <supportLogId> })` and `uf.uploadFiles(file, { acl, signal })`.
  - `uploadFiles` returns `{ data, error }` rather than throwing, and it polls for up to 10 minutes. The adapter therefore passes an `AbortSignal` with a short timeout (default 30 s).
  - If the upload fails or times out, the webhook **falls back to `base64`** and records `screenshot.uploadError`, so the Support Log is never lost.
  - The webhook JSON includes both `screenshot.url` and `screenshot.key`, so the file can be deleted or re-signed later.

Every webhook request is signed with an HMAC-SHA256 `X-Signature` header (plus a timestamp) using a shared secret held on the server. Receivers can use it to verify the request came from the Server Helper.

### UploadFile access policy
- **Default: `public-read`.** URLs are permanent and unguessable (`uploadfile.dev/f/<appId>/<key>`), so links in emails and Pathway issues keep working indefinitely.
- **Option: `acl: "private"`.** The webhook gets a signed URL instead. UploadFile caps signed URLs at 7 days, so these links expire. This is documented clearly.
- **Later enhancement:** keep the file private and give the webhook a permanent Screenshot Link on the Relay Endpoint (`/screenshot/<key>`). Opening it runs the Authorize Hook, then redirects to a fresh short-lived signed URL.

## Consequences
- The default setup works out of the box. The `upload` mode keeps webhook bodies small for strict receivers.
- Uploaded Screenshots may sit at public (if unguessable) URLs. The redaction and size-cap rules in ADR-0005 and ADR-0008 matter even more here. Private or expiring links should be used where the provider supports them.
