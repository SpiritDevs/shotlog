# Context: shotlog

**shotlog** (npm: `shotlog`, site: shotlog.dev) is a drop-in support-reporting widget for React apps. Someone using a host app opens a small card, describes what they were trying to do, attaches an annotated screenshot, and submits it as a Support Log.

## Glossary

- **Host App**: The React application that installs this library. It owns auth, users, and deciding who gets to see the widget.
- **Support Log**: One submitted report. It holds a written description of what the reporter was trying to do and, optionally, an annotated screenshot and a Screen Recording. It also carries Environment, Host Context, and the Diagnostic Trail.
- **Reporter**: The person filling in a Support Log. Often an admin, but it could be an end user if the Host App allows it.
- **Launcher**: The floating button the library renders in a bottom corner of the screen in Standalone Mode.
- **Report Card**: The pop-up card where the Reporter writes and submits a Support Log.
- **Standalone Mode**: The library renders its own Launcher. No host code is needed beyond mounting it.
- **Programmatic Mode**: No Launcher is rendered. The Host App opens the Report Card itself through the library's API, for example from its own button or menu item.
- **Support Log ID**: The unique ID generated in the browser for each Support Log. It has a short readable form (e.g. `SL-7F3K`) used in the success message, the email subject, and the webhook JSON. The Relay Endpoint also uses it to ignore repeated submissions.
- **Type**: The category the Reporter picks for a Support Log: Bug, Question, or Idea by default. The Host App can change the list.
- **Description**: The Reporter's free-text account of what they were trying to do. The only required field.
- **Screenshot**: The single image attached to a Support Log. It can be annotated before submitting.
- **Capture Method**: How the Screenshot is obtained. One of **Page Render** (rebuilds the page from the DOM; the default), **Screen Capture** (the browser's `getDisplayMedia` API), or **Paste / Upload**.
- **Screen Recording**: An optional video of the Reporter's tab, with their microphone unless muted and anything they drew during it. It is offered only when the Relay Endpoint has recording storage, and uploads from the browser straight to that storage.
- **Recording Drawing**: A mark (Draw, Arrow, Rectangle or Oval) the Reporter makes over the page while recording. It is part of the video, not an Annotation. All of them fade together 10 seconds after the last one is drawn.
- **Annotation Editor**: The full-viewport, Shottr-style editor where the Reporter marks up the Screenshot.
- **Annotation**: One editable mark in the Annotation Editor: Arrow, Rectangle, Oval, Text, Freehand, Highlighter, Step Counter, Spotlight, or Pixelate/Redact.
- **Step Counter**: An auto-incrementing numbered marker (①②③) for showing steps in order.
- **Spotlight**: An Annotation that dims everything outside a chosen area.
- **Environment**: Browser and page information captured automatically (URL, browser/OS, viewport, locale, timezone, etc.).
- **Host Context**: Data the Host App supplies: `reporter` (who is reporting, with any fields the app wants) and `metadata` (free-form data about the app or session).
- **Diagnostic Trail**: Recent console errors/warnings and failed network requests, recorded from mount. On by default, and can be turned off.
- **Included Details**: The collapsible section of the Report Card that shows the Reporter everything attached beyond what they wrote.
- **Playground**: The local test app environment in this repo, used for development and as the target for end-to-end tests.
- **Smoke Test**: A real send through every provider (Resend, SES, Webhook, UploadFile) that must pass before any production release.
- **Relay Endpoint**: A route in the Host App's backend that receives a Support Log from the browser and passes it to the Server Helper.
- **Server Helper**: The server-only part of the package that delivers a Support Log through a Delivery Channel.
- **Authorize Hook**: A function the Host App gives the Server Helper to decide whether a request may submit a Support Log (e.g. "is there a logged-in admin session?").
- **Delivery Channel**: Where a Support Log ends up: **Email** (the default), **Slack**, or **Webhook**. Any combination can be configured.
- **Email Provider**: The service used to send Email. One of Resend, Amazon SES, or generic SMTP.
- **Screenshot Mode**: How a Webhook carries the Screenshot: `base64` (embedded in the JSON; the default) or `upload` (a link from a Storage Adapter).
- **Storage Adapter**: A server-side component that uploads the Screenshot and returns a URL. **Recording Storage** is its counterpart for Screen Recordings: it authorizes a direct browser upload and later turns the upload's ticket into a URL. `uploadfile()` is both. One is built in for **UploadFile** (the in-house service, `@uploadfile/core`), and the interface is open for others (S3, R2, ...).
- **Webhook**: A URL configured by the Host App that receives the Support Log as JSON in a POST request. This is how the widget reaches Pathway.

## Decisions

- [ADR-0001](docs/adr/0001-react-npm-library-with-two-modes.md): React npm library with Standalone and Programmatic modes
- [ADR-0002](docs/adr/0002-host-app-owns-visibility.md): The Host App decides who sees the widget
- [ADR-0003](docs/adr/0003-server-side-delivery-email-default-webhook-secondary.md): Server-side delivery, with Email as the default and Webhook as the alternative
- [ADR-0004](docs/adr/0004-hybrid-screenshot-capture.md): Hybrid screenshot capture, one Screenshot per Support Log
- [ADR-0005](docs/adr/0005-shottr-style-annotation-editor.md): Model the Annotation Editor on Shottr, as a full-viewport overlay
- [ADR-0006](docs/adr/0006-support-log-context-layers.md): What a Support Log captures automatically (Environment, Host Context, Diagnostic Trail)
- [ADR-0007](docs/adr/0007-report-card-fields.md): Report Card fields: Type chips plus a single Description
- [ADR-0008](docs/adr/0008-relay-endpoint-abuse-protection.md): Protecting the Relay Endpoint from abuse
- [ADR-0009](docs/adr/0009-screenshot-transport-and-storage.md): How the Screenshot travels (multipart, inline email image, base64 or upload for webhooks) and signed webhooks
- [ADR-0010](docs/adr/0010-shadow-dom-style-isolation.md): Shadow DOM style isolation, themed with CSS variables
- [ADR-0011](docs/adr/0011-web-standard-server-handler-and-packaging.md): Web-standard server handler, one package with separate entry points
- [ADR-0012](docs/adr/0012-typescript-and-effect.md): TypeScript throughout, Effect internally only, with fully exported types
- [ADR-0013](docs/adr/0013-release-safety.md): Release safety: API and contract snapshots, type tests, integration and end-to-end tests, gated releases
- [ADR-0014](docs/adr/0014-monorepo-and-playground.md): Monorepo layout and Playground contents
- [ADR-0015](docs/adr/0015-submission-lifecycle.md): What happens after Submit: IDs, safe retries, drafts, success and failure, opt-in shortcut
- [ADR-0016](docs/adr/0016-accessibility-and-labels.md): Accessibility and translation baseline
- [ADR-0017](docs/adr/0017-slack-delivery.md): Slack delivery, with an optional Reporter-chosen channel
- [ADR-0018](docs/adr/0018-screen-recording.md): Screen Recording, uploaded straight from the browser

## Build order

See [docs/build-order.md](docs/build-order.md).

## Open questions

- None at the moment.
