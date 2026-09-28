# ADR-0006: What a Support Log captures automatically

**Status:** Accepted, 2026-09-28

## Context
Reporters describe the symptom ("save didn't work"). Whoever triages it needs the page, browser, user, and recent errors. Capturing these automatically is often the most useful part of a Support Log.

## Decision
Besides the description and Screenshot, a Support Log carries three layers of context.

### 1. Environment (always on)
Everything the browser can cheaply tell us:
- **Page:**
  - URL and route
  - Page title
  - Referrer
  - Time spent on the page
- **Browser:**
  - User agent, parsed into browser, OS, and device type
  - Language and locale
  - Timezone and timestamp
  - Screen size, viewport size, device pixel ratio
  - Colour scheme (light/dark)
  - Online status
- **Library:** version

### 2. Host Context (supplied by the Host App)
- **`reporter`**: who is reporting. It has well-known fields (`id`, `email`, `name`) plus any other fields the Host App wants to add, e.g. `plan`, `role`, `accountCreatedAt`.
- **`metadata`**: free-form key/value data about the app or session, e.g. app version, tenant/org ID, feature flags, environment.
- Both accept either a plain object or a (sync or async) function. A function is called at submit time, so the values are current.

### 3. Diagnostic Trail (on by default, configurable)
Recording starts when the library mounts:
- The last ~50 **console errors and warnings**, with stack traces.
- Recent **failed network requests**: method, URL, and status code only. Never bodies or headers.

Configured with e.g. `diagnostics: { console: true, network: true }`.

### Privacy guards
- Query strings are stripped from recorded URLs by default.
- The Report Card has a collapsible **Included Details** section that shows the Reporter exactly what will be sent.

## Consequences
- Recording the Diagnostic Trail means patching `console` and `fetch`/`XMLHttpRequest`. This has to be done carefully: never break or double-wrap them, and undo the patches on unmount.
- Because `reporter` and `metadata` are open-ended, the payload schema has to allow arbitrary extra keys under those two fields.
- If `reporter.email` is present, the Email channel can set it as Reply-To.
