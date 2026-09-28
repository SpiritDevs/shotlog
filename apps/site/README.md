# shotlog.dev

Static Vite + React site for shotlog. Landing page at `/`; package documentation at `/docs/`.

```sh
# From the repository root:
pnpm build                         # Build the actual library exports first.
pnpm --filter site build           # apps/site/dist
pnpm --filter site preview --host 127.0.0.1 --port 5317 --strictPort
pnpm typecheck
pnpm lint
```

`pnpm --filter site dev` starts the local site after the library has been built. The site resolves `shotlog` through its published package exports in `dist`; there are no source aliases.

## Content and demo

- `packages/shotlog/README.md` is imported with `?raw` at build time. The Vite plugin renders its headings, anchors, tables, and code into `docs/index.html`. `marked` is build-only; docs remain readable without JavaScript.
- The same README supplies the landing-page code excerpts. Extraction fails when the expected examples change so the site cannot silently keep obsolete snippets.
- Repository references linked from the README are emitted under `/docs/reference/`, without assuming a GitHub remote.
- The live demo mounts the built `ShotlogProvider` with a custom `onSubmit`. It retains the exact `log` JSON and the separately supplied PNG in browser memory. No endpoint, upload, email, analytics, external fonts, or report request is configured. Text drafts follow the library's tab-scoped session storage behavior.
- Result URLs are revoked when replaced or unmounted. The result dialog opens only after the Report Card releases its focus trap.
- Light/dark preferences follow the OS until explicitly changed, then persist locally. Hand-written CSS uses system fonts and respects reduced motion.

## Deployment

Use **Vercel root directory `apps/site`**, with access to workspace files outside that directory enabled. The included `vercel.json` builds the library before the site and serves `dist`. It normalizes directory URLs with trailing slashes; there are no SPA rewrites. Both `/` and `/docs/` have real HTML entry points.

Production deployment still follows the repository's release and real-provider smoke-test policy. This task does not deploy.

## Social image

`public/og.png` is a checked-in deliverable generated from `public/og.svg`. To regenerate with an available Playwright installation:

```sh
node apps/site/scripts/generate-og.mjs /tmp/pw/node_modules/playwright/index.mjs
```

The favicon is copied from `assets/icon.svg`, with an accessible SVG title added.

## TODO

Replace the clearly marked GitHub placeholder in `src/ui.tsx` with the actual repository URL once the remote exists.
