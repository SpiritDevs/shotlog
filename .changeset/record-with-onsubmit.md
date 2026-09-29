---
"shotlog": minor
---

Screen Recording with a custom `onSubmit`. Pass `recording` (or `recording={{ maxSeconds, maxBytes }}`) on the provider to offer **Record screen** without a Relay Endpoint; `onSubmit` then receives `recording: { video, mimeType, durationMs, width, height }` alongside the Screenshot. With `endpoint`, the Relay Endpoint still decides and the prop isn't accepted.
