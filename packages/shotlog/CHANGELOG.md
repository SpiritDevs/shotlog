# shotlog

## 1.0.0

### Major Changes

- 2fe24b1: Release shotlog 1.0.0: in-app support reports for React.

  - Standalone Launcher and programmatic Report Card controlled by the Host App.
  - Shadow DOM style isolation, light/dark themes, and accessible keyboard controls.
  - Typed, replaceable UI labels and Type options with stable delivered values.
  - Account-scoped session drafts, optional memory-only drafts, and explicit draft clearing.
  - Pending report IDs retained for safe retries and per-channel relay deduplication.
  - Environment, Host Context, and a bounded Diagnostic Trail with an Included Details preview.
  - Page Render, Screen Capture, and image paste/upload with one optional Screenshot.
  - Capture in 5 seconds: a countdown that moves the card aside so menus and hover states can be captured.
  - Full-viewport Annotation Editor with shapes, arrows, text, crop, undo, and baked-in redaction.
  - Fetch-standard server handler and streaming Node adapter for framework integration.
  - Authorization hooks, rate limits, schema validation, and bounded multipart requests.
  - Resend, Amazon SES, and SMTP email delivery, plus signed webhooks.
  - Slack delivery: one Block Kit message per report with the Screenshot in its thread, to a fixed channel or one the Reporter picks.
  - Base64 screenshots or storage uploads with inline fallback and an optional UploadFile adapter.
  - Versioned JSON Schema, plain TypeScript public APIs, and separate client/server exports.
  - ESM-only distribution; Node ≥20.19 for Node deployments and React / React DOM ≥18 for the client.
