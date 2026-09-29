# shotlog

## 1.2.0

### Minor Changes

- f66812d: Brazilian Portuguese, and translatable emails and Slack messages.

  - `shotlog/locales/pt-BR` exports `labels` for the widget, and `emailLabels` and `slackLabels` for the server. Import it with `import * as ptBR from "shotlog/locales/pt-BR"`.
  - `ShotlogLabels.lang` (default `en`) is set as the widget's `lang` attribute.
  - `delivery.slack.labels` (`Partial<SlackLabels>`) and `defaultSlackLabels` translate Slack messages.
  - `EmailLabels` gains `lang` for `<html lang>` and `type`, which names Type values in the subject and heading. Both default to the previous English output.

## 1.1.0

### Minor Changes

- Slack delivery, Capture in 5 seconds, and truer page captures.

  - `delivery.slack` posts each report as one Block Kit message through a bot token and shares the Screenshot in its thread. Send every report to one `channel`, map Types to channels (`{ Bug: "#bugs", Idea: "#ideas" }`), or leave a Type unmapped so the Reporter picks from a "Slack channel" dropdown. The server accepts only channels it offered. The Relay Endpoint now answers `GET` with those options, behind the Authorize Hook.
  - `DeliveryFailed.channel` can be `"slack"`.
  - "Capture in 5 seconds" in the screenshot menu counts down with the card out of the way, so a menu or hover state can be captured. Esc or Cancel stops it. New labels: `captureDelayed`, `countdown`, `cancelCountdown`, `slackChannel`, `slackNoChannels`.
  - Page Render keeps live form state: selects, textareas, and changed checkboxes and radios render as they are on screen.

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
  - Full-viewport Annotation Editor with shapes, arrows, text, crop, undo, and baked-in redaction.
  - Fetch-standard server handler and streaming Node adapter for framework integration.
  - Authorization hooks, rate limits, schema validation, and bounded multipart requests.
  - Resend, Amazon SES, and SMTP email delivery, plus signed webhooks.
  - Base64 screenshots or storage uploads with inline fallback and an optional UploadFile adapter.
  - Versioned JSON Schema, plain TypeScript public APIs, and separate client/server exports.
  - ESM-only distribution; Node ≥20.19 for Node deployments and React / React DOM ≥18 for the client.
