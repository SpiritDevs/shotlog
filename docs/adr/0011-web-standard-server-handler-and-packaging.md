# ADR-0011: Web-standard server handler, published as one package with separate entry points

**Status:** Accepted, 2026-09-28

## Context
Host App backends vary (Next.js, Remix, Hono, Express, Fastify, Workers, Bun, Deno). The Server Helper must plug into all of them without being tied to any one framework.

## Decision
- The core is `createSupportHandler(config)`, which returns `(req: Request) => Promise<Response>`, using the Fetch API types.
  - It works directly in Next.js App Router (`export const POST = handler`), Remix, Hono, Bun, Deno, and Cloudflare Workers.
  - `toNodeHandler(handler)` adapts it for Express, Fastify, and Node `http`.
- The Email Providers have different runtime needs:
  - Resend uses the REST API through `fetch` with no SDK dependency. Resend and SES talk HTTP, so they work on any runtime. Both abort timed-out requests after 15 seconds.
  - SMTP needs a raw TCP connection, so it is **Node-only**. It fails with a clear, typed error on edge runtimes. Its 15-second connection, greeting, and socket timeouts bound inactivity; there is no total send deadline because nodemailer cannot cancel a send in progress. Admission and in-flight coalescing stay held until the transport settles.
  - The Relay Endpoint adds no email timeout. Custom Email Providers must bound their own duration and honour cancellation.
- It ships as **one npm package with subpath exports**:
  - `shotlog`: the React client (Launcher, Report Card, Annotation Editor, hooks)
  - `shotlog/server`: `createSupportHandler`, Delivery Channels, `resend`, Storage Adapters
  - `shotlog/ses`: `ses` and SES configuration types
  - `shotlog/smtp`: `smtp` and SMTP configuration types
  - `shotlog/node`: `toNodeHandler`
- Provider SDKs are **optional peer dependencies** (`@aws-sdk/client-sesv2`, `nodemailer`, and `@uploadfile/core`).
- SES and SMTP use separate entry points for bundler safety: importing only `shotlog/server` never requires either SDK to resolve. Lazy loading alone does not provide this isolation because bundlers resolve literal dynamic imports.
- Within the SES and SMTP entries, dynamic imports still defer SDK loading until configuration is used. In non-bundled Node, a missing SDK produces `ProviderNotInstalled` with an install hint at send time.

## Name
The package is published as **`shotlog`** (unscoped) on npm, with **shotlog.dev** as its home.
- As of 2026-09-28, both the npm name and the domain were free, and so were the look-alike names npm would treat as clashing (`shot-log`).
- To reserve them, register the domain and publish a placeholder `0.0.0`.
- Related prefixes:
  - CSS variables use `--shotlog-*`.
  - Short Support Log IDs use `SL-`.

## Consequences
- The handler API is the same across every framework, and installation is a single `npm i`.
- Server code can't end up in client bundles, because it is only reachable through server entry points.
- A peer dependency that is configured but missing must produce a clear install hint, not a confusing import error.
