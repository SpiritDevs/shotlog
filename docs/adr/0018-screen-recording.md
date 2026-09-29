# ADR-0018: Screen Recording, uploaded straight from the browser

**Status:** Accepted, 2026-09-29

## Context
A Screenshot shows one moment. Many problems are a sequence: the menu that closes too early, the form that loses what was typed. The owner wants Reporters to record the tab, talk over it, and point at things while they do. It should be available when the Host App has UploadFile set up.

Videos are far larger than Screenshots: about 20 MB a minute. They can't take the Screenshot's path through the Relay Endpoint. Serverless platforms cap request bodies at a few megabytes, and ADR-0008's limits exist to keep that route cheap.

## Decision

### Server
- **Opt-in.** `createSupportHandler({ recording: { storage, maxSeconds?, maxBytes? } })`. The defaults are 300 seconds and 200 MiB. The Relay Endpoint's `GET` advertises `recording: { maxSeconds, maxBytes }`, and the Report Card only offers recording when it's there and the browser has `getDisplayMedia` and `MediaRecorder`. "When UploadFile is set up" became an explicit option, not the presence of `UPLOADFILE_TOKEN`. Webhook Screenshot storage already works that way, and a token alone shouldn't change what Reporters can do.
- **Direct upload, then a ticket.**
  1. On Submit, the browser POSTs JSON `{ recordingUpload: { id, size, mimeType } }`. This runs the Authorize Hook and its own rate-limit buckets (`recording-ip`, `recording-reporter`), so a recording never costs its report a request.
  2. `RecordingStorage.createUpload` returns a browser upload target and a ticket.
  3. The browser uploads, then submits the report with a `recording` multipart field: the ticket plus the measured width, height, duration, size and MIME type.
  4. `RecordingStorage.resolveUpload(ticket)` turns the ticket into `{ url, key }`.

  Both storage calls get 10 seconds. Failures are logged and reach the browser only as `UploadFailed`.
- **Tickets.** A ticket passes through the browser, so storage must only accept tickets it issued. Otherwise a Reporter could have the Relay Endpoint sign and send a link to any file in the bucket. Tickets are not bound to the Support Log ID: editing after a failed attempt starts a new identity (ADR-0015), and that shouldn't re-upload a large video. The browser caches the ticket per video and drops it if the Relay Endpoint rejects it.
- **Targets.** Two kinds of upload target:
  - `Put`: one presigned HTTP PUT, as S3, R2 and GCS issue them. The bucket must allow the Host App's origin with CORS.
  - `UploadFile`: the built-in adapter's resumable session.
- **UploadFile.** `uploadfile()` now implements `RecordingStorage` as well as `StorageAdapter`.
  - It reserves the file with the token (`POST /api/v1/uploads`), and the browser sends the parts with the session-only upload token. The service already allows that from any origin.
  - `@uploadfile/core` 0.2.0 doesn't expose session creation or its browser part uploader separately. So shotlog speaks that protocol itself: on the server in `uploadfile.ts`, and in the browser in `recording/upload.ts`, so the widget doesn't bundle the SDK.
  - Tickets are HMAC-SHA256 signed with a key derived from the token.
  - `acl` and `signedUrlExpiresIn` apply as they do to Screenshots.
  - Exposing both halves from `@uploadfile/core` would let shotlog drop its copy.

### Payload
- **`schemaVersion` 2** adds an optional `recording: { url, key, width, height, durationMs, size, mimeType }`. The v1 JSON Schema forbids unknown properties, so under ADR-0013 this is a new version and a major release. `shotlog/schema.json` is now v2, and `shotlog/schema.v1.json` keeps v1.
- The Relay Endpoint still accepts v1 submissions and delivers them as v2. A widget built before v2 may still be open in a browser during a deploy.
- Email shows a **Watch recording** button with the duration, Slack a link, and webhooks the object. The video is never attached.

### Browser
- **Capture.** `getDisplayMedia` prefers the current tab, at up to 1080p and 30 fps, recorded as VP9 or VP8 WebM at 2.5 Mbps, or MP4 where WebM isn't available.
  - Everything that needs the click's user activation runs synchronously in it: the picker and the `AudioContext`.
  - The session UI loads as its own chunk: fetched ahead once recording is offered, and in parallel with the picker.
- **Microphone.** The recording always has an audio track from a Web Audio mix, so the microphone can join after recording starts (its permission prompt doesn't delay it). Mute sets the mix's gain. Without a microphone the toolbar says so and the video is silent.
- **Drawing.** Drawings are an SVG layer over the page inside the widget's shadow root, so they're part of the recorded pixels.
  - The tools are Use the page (the default, with no layer in the way), Draw, Arrow, Rectangle and Oval, in one colour (`--shotlog-recording-ink`).
  - Every drawing fades together 10 seconds after the last stroke. Drawing again, even mid-fade, keeps them all and restarts the wait, so a larger sketch can be built up.
  - Clear removes them at once. Esc returns to Use the page.
- **Toolbar.**
  - The floating toolbar is also in the video. A tab capture can't exclude part of its own page.
  - It shows the elapsed time, the tools, Clear, Mute, Discard (with a second click to confirm) and Finish, and can be dragged aside.
  - The Report Card steps aside as it does for a countdown.
  - Recording ends at `maxSeconds`, near `maxBytes`, or when the Reporter stops sharing from the browser's own bar, which counts as Finish.
- **Seekable video.** MediaRecorder writes WebM without a duration, so players can't seek it. The measured duration is written into the WebM Info element before upload, and anything unexpected leaves the file untouched.
- **Lifetime.** A recording is memory-only, like a Screenshot. `clearDraft`, a scope change or unmounting cancels a recording in progress and aborts an upload. The provider owns that cancellation, not the session component, so React StrictMode's repeated effects can't end a recording.

## Consequences
- Reporters can show a sequence, with narration, without the video touching the Host App's servers.
- Videos go to storage when the Reporter submits, not when they finish recording: a discarded recording costs nothing. The trade-off is a wait on Submit, shown as upload progress.
- The UploadFile session protocol is duplicated in shotlog until `@uploadfile/core` exposes it.
- Only Chromium can record without a person in Playwright (`--auto-accept-this-tab-capture`), so the end-to-end test runs there. Firefox and Safari share the code path but are checked by hand.
- A custom `onSubmit` opts in with the provider's `recording` prop and receives the video Blob as `ShotlogSubmission.recording`; with a Relay Endpoint the prop is not allowed, since the server decides. shotlog.dev's demo uses this, so its recordings never leave the visitor's browser.
