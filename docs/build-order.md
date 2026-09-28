# Suggested build order

Each step ends with something working in the Playground. The release gates from ADR-0013 are set up early so every later step is protected by them.

1. **Repo foundation.** Monorepo (ADR-0014), strict TypeScript, Effect internals, and the `shotlog` / `shotlog/server` / `shotlog/node` entry points (ADR-0011). Set up CI with the API snapshot, the "no `effect` in `.d.ts`" check, and Changesets (ADR-0012, ADR-0013). Reserve the npm name and shotlog.dev.
2. **Support Log schema.** Define it in `effect/Schema`, with `schemaVersion`, a published JSON Schema, a contract snapshot, and the Support Log ID (ADR-0006, ADR-0015).
3. **Server Helper, Webhook first.** `createSupportHandler`, the Authorize Hook, size limits, validation, rate limiting, safe retries, and signed Webhook with `base64` Screenshot Mode (ADR-0003, ADR-0008, ADR-0009).
4. **Playground skeleton.** The Inbox view, the webhook receiver, and Mailpit via docker-compose (ADR-0014).
5. **Report Card and Launcher.** Built in the Shadow DOM, with Standalone and Programmatic modes, Type and Description fields, drafts, success and failure states, the `labels` prop, and accessibility (ADR-0001, ADR-0007, ADR-0010, ADR-0015, ADR-0016). This is the first complete end-to-end flow, without a Screenshot yet.
6. **Environment, Host Context, and Diagnostic Trail**, plus the Included Details section (ADR-0006), with the Playground's trouble buttons.
7. **Email channel.** The HTML and plain-text template, then Resend, then SES, then SMTP (ADR-0003, ADR-0009).
8. **Screenshot capture.** Page Render, then Screen Capture, then paste/upload, with the Playground's awkward test pages (ADR-0004).
9. **Annotation Editor, v1 tools** (ADR-0005). This is the largest step, so ship it in slices:
   - Select, Arrow, Rectangle, Oval, Pixelate/Redact, Crop, undo/redo
   - Text, Freehand, Highlighter, Step Counter, Spotlight, curved arrows, copy/paste/duplicate
10. **UploadFile Storage Adapter.** Upload mode with the timeout → base64 fallback and the `private` option (ADR-0009).
11. **Next.js example and full Playwright coverage** across Chromium, Firefox, and WebKit (ADR-0013).
12. **Production Smoke Test**, then the first `latest` release (ADR-0013).
