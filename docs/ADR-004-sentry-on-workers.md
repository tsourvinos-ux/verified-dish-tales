# ADR-004: Sentry on Cloudflare Workers (hand-rolled envelope)

**Status:** Accepted (2026-05)

## Context

`@sentry/node` is Node-only and crashes in Worker isolates. `@sentry/cloudflare` requires a Wrangler entry point we don't expose (TanStack Start owns the Worker entry).

## Decision

- **Browser**: official `@sentry/react`, initialised after a tiny server-side handoff that injects the DSN.
- **Server**: a 60-line `captureServerException()` helper in `src/lib/sentry.server.ts` posting JSON to Sentry's `/api/<project>/envelope/` endpoint. Fire-and-forget, never throws, scrubs PII keys (`email`, `password`, `content`, `code`, `token`).

## Consequences

- We don't get auto-instrumentation (no breadcrumbs from `fetch`, no transactions). We do get exceptions with stacks + tags + request-id, which covers 95% of real debugging.
- If Sentry adds Workers SDK with a non-Wrangler entry, switch to it — replace one file.
- DSN rotation is a single secret update + redeploy.