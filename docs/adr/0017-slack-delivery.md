# ADR-0017: Slack delivery, with an optional Reporter-chosen channel

**Status:** Accepted, 2026-09-29

## Context
Teams triage support reports in Slack. ADR-0003 left Slack to a custom `onSubmit`, which means every Host App writes its own Block Kit and file upload code. The owner also wants the Reporter to pick the channel when the Host App hasn't fixed one.

## Decision
- **Slack is a third Delivery Channel.** `delivery.slack` takes a bot token and sits alongside `email` and `webhook`. Any combination works, and each channel is deduped separately.
- **Bot token, not an incoming webhook.** An incoming webhook is tied to one channel and can't upload files. The bot token stays on the server, like every other credential.
- **One message, Screenshot in its thread.** The upload flow runs in this order:
  1. The PNG bytes are uploaded first with `files.getUploadURLExternal`. Nothing is visible yet, so a failed upload retries cleanly.
  2. `chat.postMessage` posts the Block Kit report.
  3. `files.completeUploadExternal` shares the Screenshot into that message's thread.

  Slack doesn't document reliable ways to put the image in the same message: `blocks` on a file share, or an image block pointing at a fresh upload. If sharing fails after the message is visible, the report still counts as delivered, and the failure is logged. Retrying would post the report twice.
- **Reporter-chosen channel.**
  - Leaving out `channel` switches the Report Card to a channel dropdown.
  - The card fetches the options with a `GET` to the Relay Endpoint, which runs the Authorize Hook.
  - The options are the `channels` allowlist when it's set, otherwise every channel the app is a member of, cached for a minute.
  - The chosen ID travels as a `slackChannel` multipart field, not in the Support Log. It's routing, not report content, and webhook and email consumers never see it.
  - The Relay Endpoint accepts only a channel it offered.
- **Escaping.** Reporter text is escaped for mrkdwn (`&`, `<`, `>`), which also defuses `<!channel>`-style mentions. Formatting such as `*bold*` is left alone.
- **Bounded time.**
  - Each Slack API call gets 5 seconds and two retries on network errors, timeouts, 429 and 5xx.
  - A whole Slack delivery is capped at 40 seconds, inside the client's 60-second budget.
  - Slack error codes fail fast and are logged for the operator.

## Consequences
- The Relay Endpoint now answers `GET`. Older clients never call it, and newer clients treat a 405 as "nothing to choose".
- Any authorized Reporter can see the names of the channels the app is in. The `channels` allowlist limits this, and the docs recommend it.
- `DeliveryFailed.channel` gains `"slack"`.
- The release Smoke Test gains a Slack check that posts to a real channel and then deletes the message and file.
