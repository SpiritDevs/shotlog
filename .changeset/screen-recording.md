---
"shotlog": major
---

Screen Recording: Reporters can record their tab, narrate over the microphone, and draw on the page while they show the problem.

- Turn it on with `createSupportHandler({ recording: { storage: uploadfile() } })`. Optional `maxSeconds` (default 300) and `maxBytes` (default 200 MiB) set the limits. The Report Card offers **Record screen** only when the Relay Endpoint's `GET` says recording is on, so route `GET` as well as `POST`.
- While recording, a floating toolbar has Use the page, Draw, Arrow, Rectangle and Oval tools, plus Clear, Mute, Discard and Finish. Drawings fade together 10 seconds after the last stroke, and drawing again keeps them all.
- Videos upload from the browser straight to storage and never pass through the Relay Endpoint. `uploadfile()` now also implements the new `RecordingStorage` interface, and other storage can implement it with presigned `PUT` URLs.
- Email shows a Watch recording button, Slack a link, and webhooks a `recording` object.
- `ShotlogLabels`, `EmailLabels` and `SlackLabels` have new recording labels, translated in `shotlog/locales/pt-BR`.

**Breaking:** `SupportLog.schemaVersion` is now `2`, which adds the optional `recording` field. Webhook receivers that check `schemaVersion === 1`, or validate against the v1 JSON Schema (which rejects unknown fields), need updating. `shotlog/schema.json` is now v2, and v1 stays available at `shotlog/schema.v1.json`. `SupportLogSubmission` omits `recording` as well as `screenshot`. The Relay Endpoint still accepts v1 submissions from widgets built before this release.
