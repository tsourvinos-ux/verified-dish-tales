# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.2.0] — Open-source readiness, hardening, observability

### Added

- **`LICENSE`** (AGPL-3.0-or-later) and SPDX declaration in `package.json`.
- **Open Graph image** (`public/og-image.png`, 1200×630) wired into root route.
- **`docs/REPO-METADATA.md`** with description + topics for GitHub repo settings.
- **`engines`** field (`bun >=1.1`, `node >=20`) and npm-portable scripts (`typecheck`, `test:e2e`, `audit`).

## [1.0.0] — Verified Rewards & Immutable Ledger

## [1.0.2] — Rate limiting, tests, ADR, load-test harness

### Added

- Per-user in-memory token-bucket rate limit on `/api/summarize` (10 req / 10 min, `429` + `Retry-After` on exceed). Best-effort, single-isolate; documented in `docs/SECURITY.md`.
- Vitest harness with 11 tests covering Zod bounds/sanitisation and `sanitizeForPrompt` prompt-injection defences. `bun run test`.
- `docs/ADR-001-no-service-worker.md` codifying the offline/SW decision (preview iframe + stale-shell hazards) so future audits stop re-flagging it.
- `scripts/loadtest.ts` for manual load-testing of `/api/summarize` (p50/p95/p99, cache hit rate, 429 count) and reward redemption (single-success invariant under concurrent contention).
- README "Testing" and "Load testing" sections; updated audit-reconciliation footnote.

## [1.0.1] — Lint guard + audit reconciliation

### Added

- ESLint rule `@typescript-eslint/no-explicit-any: error` to enforce the "no `any`" architectural directive at lint time. Generated `src/routeTree.gen.ts` is ignored.
- README "Audit reconciliation" footnote dated 2026-05-13.


First pinned release. Use this tag as a clean rollback point before introducing breaking changes.

### Added

- Immutable review ledger: `reviews` and `owner_responses` are append-only at the database level (no UPDATE/DELETE policies).
- One immutable response per review (`UNIQUE(review_id)`), gated by `is_business_member()` ownership join.
- Verified Rewards lifecycle: Active → Used (via atomic single-use UPDATE) → Expired (time-based filter); `prevent_used_at_overwrite` trigger blocks tampering.
- Auto-mint of a 14-day single-use reward on every 5-star review.
- Streaming AI ledger summaries via Lovable AI Gateway (`google/gemini-3-flash-preview`), token-by-token, with abortable Stop button.
- Admin console: create businesses, assign restaurateur memberships, mint rewards.
- Patron wallet at `/account` with Active / Used / Expired sections and one-tap redeem.
- Bistro Heritage design system (forest / cream / clay / muted tokens in `src/styles.css`).
- Mobile-first chat-bubble ledger feed (right-aligned patron reviews, left-aligned owner responses with Verified badge).
- PWA install manifest (`public/manifest.webmanifest`) — Add to Home Screen on iOS and Android. No service worker (deliberate, see `docs/SECURITY.md`).
- `README.md`, `docs/SECURITY.md`, `.lovable/instructions.md`, this `CHANGELOG.md`.

### Security

- `business_profile_membership` SELECT restricted to self or admin (closes staff-enumeration vector).
- `/api/summarize` requires a valid Supabase Bearer token; review content is fetched server-side and sanitised to neutralise prompt injection.
- All write paths use `createServerFn` + `requireSupabaseAuth` middleware; no `service_role` in any client-reachable module.
- Zod validation with XSS sanitisation on every write path.

### Out of scope (intentional)

- No Supabase Edge Functions — TanStack Start uses `createServerFn` as the server layer; duplicating is anti-pattern.
- No service worker — breaks the Lovable preview iframe and ships stale shells to installed PWAs.