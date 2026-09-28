# ADR-0003: Server-side delivery, with Email as the default and Webhook as the alternative

**Status:** Accepted, 2026-09-28

## Context
The Report Card runs in the browser and may be shown to untrusted users (ADR-0002). Browsers can't send email by themselves, and any API key or webhook secret included in the client bundle is readable by anyone.

## Decision
- The browser never delivers a Support Log directly. The client library hands the Support Log to an `onSubmit` callback. By default, that callback POSTs to a **Relay Endpoint** in the Host App's own backend.
- The package includes a **Server Helper** (separate server-only entry point) that the Host App mounts behind its Relay Endpoint. The Server Helper sends the Support Log through a **Delivery Channel**:
  - **Email** (default): sends to a recipient address the Host App configures. The Email Provider can be swapped out:
    - Resend (API key)
    - Amazon SES
    - Generic SMTP
  - **Webhook** (alternative): POSTs the Support Log as JSON to a URL the Host App configures. Pathway, or anything else, is reached this way.
- A Host App can skip the Server Helper and handle `onSubmit` itself (e.g. to write to its own database or post to Slack).

## Consequences
- Provider credentials and webhook URLs/secrets live only on the server.
- The Host App needs a backend route. For setups with no backend at all, that's a deliberate trade-off.
- The Support Log's JSON shape becomes a public contract: it's what webhooks receive and what the email is rendered from. It needs versioning.
