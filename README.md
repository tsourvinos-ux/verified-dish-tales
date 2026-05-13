# TasteLedger — Verified Restaurant Review Ledger

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

## Security

See [`docs/SECURITY.md`](./docs/SECURITY.md) for the full RLS matrix, validation pipeline, and threat model.

## Versioning

See [`CHANGELOG.md`](./CHANGELOG.md). v1.0.0 is the pinned baseline.