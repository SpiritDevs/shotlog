# ADR-0011: Web-standard server handler, published as one package with separate entry points

**Status:** Accepted, 2026-09-28

## Context
Host App backends vary (Next.js, Remix, Hono, Express, Fastify, Workers, Bun, Deno). The Server Helper must plug into all of them without being tied to any one framework.

## Decision
- The core is `createSupportHandler(config)`, which returns `(req: Request) => Promise<Response>`, using the Fetch API types.
  - It works directly in Next.js App Router (`export const POST = handler`), Remix, Hono, Bun, Deno, and Cloudflare Workers.
  - `toNodeHandler(handler)` adapts it for Express, Fastify, and Node `http`.
- The Email Providers have different runtime needs:
  - Resend and SES talk HTTP, so they work on any runtime.
  - SMTP needs a raw TCP connection, so it is **Node-only**. It fails with a clear, typed error on edge runtimes.
- It ships as **one npm package with subpath exports**:
  - `shotlog`: the React client (Launcher, Report Card, Annotation Editor, hooks)
  - `shotlog/server`: `createSupportHandler`, Delivery Channels, Email Providers, Storage Adapters
  - `shotlog/node`: `toNodeHandler`
- Provider SDKs are **optional peer dependencies**, imported lazily only when that provider is configured:
  - `resend`
  - `@aws-sdk/client-sesv2`
  - `nodemailer`
  - `@uploadfile/core`

## Name
The package is published as **`shotlog`** (unscoped) on npm, with **shotlog.dev** as its home.
- As of 2026-09-28, both the npm name and the domain were free, and so were the look-alike names npm would treat as clashing (`shot-log`).
- To reserve them, register the domain and publish a placeholder `0.0.0`.
- Related prefixes:
  - CSS variables use `--shotlog-*`.
  - Short Support Log IDs use `SL-`.

## Consequences
- The handler API is the same across every framework, and installation is a single `npm i`.
- Server code can't end up in client bundles, because it's only reachable through `/server`.
- A peer dependency that is configured but missing must produce a clear install hint, not a confusing import error.
