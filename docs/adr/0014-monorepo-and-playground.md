# ADR-0014: Monorepo layout and Playground contents

**Status:** Accepted, 2026-09-28

## Decision

### Repo layout
```
packages/shotlog/        the library (client, /server, /node)
apps/playground/       Vite + React app with a small local backend
apps/next-example/     Next.js App Router example, also run in the end-to-end tests
e2e/                   Playwright specs
```

### What's in the Playground
1. **Settings panel**, where every option can be switched at runtime:
   - Standalone / Programmatic mode
   - Launcher position
   - Theme and accent
   - Email / Webhook
   - `base64` / `upload`
   - Diagnostic Trail on or off
   - The fake `reporter` and `metadata`
2. **Awkward test pages** that stress Page Render capture:
   - Cross-origin iframe
   - `<video>`
   - WebGL canvas
   - Cross-origin images with and without CORS headers
   - `backdrop-filter`
   - Long scrolling pages
   - Fixed and sticky headers
   - An aggressive global CSS reset page, to prove the Shadow DOM isolation holds
3. **Buttons that cause trouble**:
   - Throw an error
   - `console.warn`
   - A failing `fetch`
   - A request with a token in the query string (to check it gets stripped)
4. **Inbox view**: every received Support Log, with the rendered email (from the in-process SMTP catcher) and the raw webhook JSON side by side, plus the signature check result.
5. **Abuse testing**:
   - Make the Authorize Hook reject requests
   - Fire 20 submissions to hit the rate limit
   - Submit an oversized Screenshot

Build order: the Inbox view (4) and the awkward test pages (2) come first.

The Playground runs **locally only** in v1. A hosted public demo can come later.

**No Docker.** The Playground's backend runs its own in-process SMTP catcher (`smtp-server` + `mailparser`) and webhook receiver, so the whole thing starts with one `pnpm dev`. This replaces the original Mailpit/docker-compose plan: Docker isn't available on the dev machine, and fewer moving parts is better anyway. The Inbox view reads from this catcher.

## Consequences
- The Playground is also the end-to-end test target (ADR-0013). Its test pages double as regression fixtures for capture.
