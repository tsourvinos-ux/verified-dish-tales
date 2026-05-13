# TasteLedger — Verified Restaurant Review Ledger

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-lodger.lovable.app-1f3a2e)](https://lodger.lovable.app)

A zero-trust, mobile-first ledger for verifiable dining interactions: immutable patron reviews, immutable owner responses, and single-use Verified Rewards.

## Mission

Establish **Verifiable Dining Integrity** through a transparent, tamper-proof ledger where post-submission alteration is architecturally impossible and reward redemption is cryptographically single-use.

## Objectives

- **Immutable interaction ledger** — patron reviews and owner responses are append-only at the database level (no `UPDATE`/`DELETE` policies).
- **Verified single-use rewards** — `used_at` flips once via atomic update; a database trigger blocks any further mutation.
- **Zero-trust security** — every persona is enforced by RLS predicates; no `service_role` reaches the client.

## Stack

- **TanStack Start v1** (React 19, Vite 7) — file-based routing, SSR, server functions
- **Lovable Cloud** (Supabase) — Postgres + RLS, auth, storage
- **Lovable AI Gateway** — `google/gemini-3-flash-preview` for streamed ledger summaries
- **Tailwind v4** + custom Bistro Heritage design tokens (`src/styles.css`)

## Architecture overview

```text
Browser ──► createServerFn (src/lib/ledger.functions.ts)
               │  • Zod-validated input
               │  • requireSupabaseAuth middleware (Bearer token)
               ▼
         Supabase client bound to caller's JWT
               │
               ▼
         Postgres + RLS + CHECK + immutability trigger
```

All app-internal server logic uses `createServerFn`. The single HTTP route (`src/routes/api/summarize.ts`) proxies SSE streaming to the AI gateway after validating the caller's bearer token and fetching review content **server-side** to neutralise prompt injection.

## Personas & access model

| Role | Granted by | Can |
|---|---|---|
| `patron` | Auto on signup | Post reviews, redeem own rewards, generate AI summaries |
| `restaurateur` | Admin via `business_profile_membership` | Post one immutable response per review for assigned business |
| `admin` | SQL seed / `user_roles` | Create businesses, assign restaurateurs, mint rewards |

Authorisation helpers (security-definer):

- `public.has_role(user_id, role)` — role check, never recursive
- `public.is_business_member(user_id, business_id)` — ownership join used in `owner_responses` INSERT policy

## Local development

```bash
bun install
bun run dev
```

`bun` is the primary toolchain. `npm install && npm run dev` also works for evaluators
who don't want to install Bun — `package.json` declares `engines: { bun: ">=1.1", node: ">=20" }`
and every script is `vite`/`vitest`-based, so npm/pnpm/yarn run them too.

Environment is auto-provisioned by Lovable Cloud (`.env` is generated, do not edit).

## Repository layout

```text
src/
  routes/                 # File-based TanStack routes
    api/summarize.ts      # SSE proxy to Lovable AI Gateway
  lib/
    ledger.functions.ts   # createServerFn handlers (writes)
    schemas.ts            # Zod schemas (shared client/server)
  integrations/supabase/  # Generated client + auth middleware (do not edit)
  hooks/use-auth.tsx      # Session + roles + memberships
supabase/migrations/      # Schema, RLS, triggers, seed data
docs/SECURITY.md          # RLS matrix + invariants
.lovable/instructions.md  # Persistent AI directives
```

## Audit reconciliation

The repo has been audited externally; several "missing" claims were inaccurate. Pointers:

| Audit claim | Actual location |
|---|---|
| "No Supabase migrations" | `supabase/migrations/` — three migrations covering schema, RLS, security hardening |
| "No RLS policies" | Defined in migrations and visible on every table; matrix in `docs/SECURITY.md` |
| "No CHECK constraints" | `reviews.rating BETWEEN 1 AND 5`, content length bounds, `prevent_used_at_overwrite` trigger on `verified_rewards` |
| "No Edge Functions" | **Intentional.** TanStack Start uses `createServerFn` (`src/lib/ledger.functions.ts`); duplicating into Edge Functions is an anti-pattern in this stack |
| "No streaming AI" | `src/routes/api/summarize.ts` (SSE) + `AISummaryPanel` token-by-token rendering with abortable Stop button |
| "No PWA install" | `public/manifest.webmanifest` (install-only; no service worker — service workers break the Lovable preview iframe and ship stale shells to installed devices) |
| "No AI instruction file" | `.lovable/instructions.md` |
| "No security documentation" | `docs/SECURITY.md` |
| "No version pinning" | `CHANGELOG.md` (`v1.0.0` — Verified Rewards & Immutable Ledger) |

_Audit dated 2026-05-13 reconciled — `any` types now ESLint-blocked (`@typescript-eslint/no-explicit-any: error`); generated `src/routeTree.gen.ts` ignored. Service-worker-based offline support remains intentionally omitted; see PWA row above._

_Update 2026-05-13: per-user rate limiting added to `/api/summarize` (best-effort, in-memory; see [`docs/SECURITY.md`](./docs/SECURITY.md) "Known gaps"). Offline / service-worker decision is now codified in [`docs/ADR-001-no-service-worker.md`](./docs/ADR-001-no-service-worker.md)._

## Security

See [`docs/SECURITY.md`](./docs/SECURITY.md) for the full RLS matrix, validation pipeline, and threat model.

## Testing

```bash
bun run test
```

Vitest covers the highest-leverage pure logic:

- `src/lib/__tests__/schemas.test.ts` — Zod bounds + XSS/control-char sanitisation for reviews and owner responses.
- `src/routes/api/__tests__/summarize-sanitize.test.ts` — prompt-injection neutralisation in `sanitizeForPrompt`.

Out of scope for v1: RLS integration tests (require a disposable Postgres), end-to-end browser tests. RLS guarantees are exercised manually via the load-test script below.

## Load testing

Manual scripts in `scripts/loadtest.ts` exercise the two production-critical hot paths:

- **`summarize`** — concurrent `/api/summarize` calls; reports p50/p95/p99 latency, cache HIT/MISS via `X-Summary-Cache`, 429 count.
- **`redeem`** — N concurrent attempts on the same `reward_id`; expects exactly **one** success and N-1 "already redeemed" responses (validates the atomic UPDATE + `prevent_used_at_overwrite` trigger).

```bash
export LOADTEST_BASE_URL=https://lodger.lovable.app
export LOADTEST_BEARER=<copy a valid Supabase JWT from devtools>
export LOADTEST_BUSINESS_ID=<uuid>
export LOADTEST_REWARD_ID=<uuid>
export LOADTEST_CONCURRENCY=20

bunx tsx scripts/loadtest.ts summarize
bunx tsx scripts/loadtest.ts redeem
```

## Versioning

See [`CHANGELOG.md`](./CHANGELOG.md). v1.0.0 is the pinned baseline.

## License

[AGPL-3.0-or-later](./LICENSE). Network-use triggers source disclosure — if you run a
modified version as a service, you must publish the modified source.