# Sections 1 + 2 — Security & Reliability + Scalability

Eight items, sized roughly by risk. Migrations and secrets are called out explicitly.

## 1. Distributed rate limit on `/api/summarize` (Upstash Redis)

Replace the in-memory token bucket with Upstash REST.

- New secrets (will prompt via `add_secret` once approved): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- New module `src/integrations/upstash/ratelimit.server.ts` — sliding-window via two Redis ops (`INCR` + `EXPIRE` on first hit), no extra deps.
- `src/routes/api/summarize.ts`: replace `rateLimitTake()` call site; on Upstash failure, **fail open** and log (availability > rate-limit precision). Headers: `X-RateLimit-Remaining`, `Retry-After`.
- 10 req / 10 min per user retained; key = `rl:summarize:{userId}`.
- Update `docs/SECURITY.md` Known Gaps → mark resolved.

## 2. Content moderation — pre-screen + admin override

**Schema (migration):**
- Add `is_visible boolean NOT NULL DEFAULT true` to `reviews` and `owner_responses`.
- Add `moderation_reason text` (nullable) to both.
- New table `moderation_flags`: `id`, `target_table`, `target_id`, `reason`, `auto bool`, `created_at`.
- RLS: public SELECT on reviews/owner_responses gains `WHERE is_visible`; admin SELECT bypass via existing `has_role(uid, 'admin')`.
- Admin-only UPDATE policy on `is_visible` (the only field admins can flip — content stays immutable).

**Pre-screen on insert:**
- `src/lib/moderation.server.ts` — calls Lovable AI (`google/gemini-2.5-flash-lite`) with a strict JSON schema: `{ allow: boolean, reason: string|null, severity: "none"|"low"|"high" }`.
- `submitReview` and `submitOwnerResponse` in `ledger.functions.ts` call moderation before insert. `severity: "high"` → reject with user-facing message. `severity: "low"` → insert with `is_visible=false` + auto flag row. Pass: insert visible.
- AI failure → fail open, insert visible, queue an auto-flag for admin review.

**Admin UI:** new `/admin/moderation` route — paginated list of `is_visible=false` rows + flagged-but-visible rows. Toggle button calls `setVisibility` server fn.

## 3. RLS integration tests (separate Supabase project)

- New devDeps: none required (reuse Supabase JS + Vitest).
- Test secrets read from env (CI-style): `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`. Documented in README; not added to project secrets (manual export when running locally).
- New `src/__tests__/rls/` with a `beforeAll` that:
  - Creates 3 disposable users (patron, restaurateur, admin) via service-role admin API.
  - Seeds a business and grants restaurateur membership.
  - Yields per-role authed Supabase clients.
- Coverage:
  - `reviews`: patron can INSERT own + cannot UPDATE/DELETE; another patron cannot INSERT as victim.
  - `owner_responses`: restaurateur of business CAN INSERT once; second insert fails on `UNIQUE(review_id)`; non-member restaurateur denied.
  - `verified_rewards`: owner can flip `used_at` once; second redeem fails; cannot null it; cannot set on someone else's reward.
  - `is_visible` (new): non-admin UPDATE denied.
- Vitest tag: `tests/rls/**`, separate `vitest.config.rls.ts`. New script `bun run test:rls`. Skipped (not failed) if env vars absent so the default `bun run test` stays green.

## 4. JWT expiry / refresh handling in `use-auth.tsx`

- `supabase-js` already auto-refreshes; the gap is UX when refresh fails (offline, revoked).
- Subscribe to `TOKEN_REFRESHED` and `SIGNED_OUT` events; on `SIGNED_OUT` while route is `_authenticated`, redirect to `/login?reason=expired`.
- Add a 60s focus-visibility check: if `session.expires_at - now < 60`, force `supabase.auth.refreshSession()`.
- Toast on permanent refresh failure.

## 5. Caching: business ledger feed

- New server fn `getBusinessLedger(business_id, cursor?)` returning normalised reviews+responses.
- Same in-memory LRU pattern as summarize: keyed on `business_id + reviewCount + max(updated)`.
- HTTP `Cache-Control: public, max-age=30` on the response.
- React Query on the client: 30s `staleTime`, `placeholderData: keepPreviousData` for cursor changes.

## 6. Cursor-based pagination on the ledger feed

- Cursor = last `created_at` (ISO) + last `id` (tiebreaker), encoded base64.
- Server fn returns `{ items, nextCursor | null }` with `LIMIT 20`.
- `restaurants.$slug.tsx`: replace single fetch with `useInfiniteQuery`; intersection-observer sentinel triggers `fetchNextPage`.
- DB index: `CREATE INDEX idx_reviews_business_created ON reviews (business_id, created_at DESC, id DESC)` — covers existing `idx_reviews_business_created` if present, else add via migration.

## 7. DB indexes — verify + add what's missing

Audit existing migration `20260513*` indexes; the brief lists ones already shipped. Confirm and add only the gaps:
- `verified_rewards (user_id, used_at)` partial: `WHERE used_at IS NULL` (Active wallet hot path).
- `reviews (business_id, created_at DESC, id DESC)` (pagination).
- `owner_responses (review_id)` — already enforced by UNIQUE; no-op.
- `moderation_flags (target_table, target_id)`.

## 8. Static-asset caching (Cloudflare via Worker headers)

- `src/server.ts` — add response header rule: assets under `/assets/*` and `/icon-*.png`/manifest get `Cache-Control: public, max-age=31536000, immutable`. HTML stays `no-cache`.

---

## Order of execution

1. Migration (items 2 schema + 7 indexes) — single migration.
2. Approval gate; then I implement code changes for items 1, 2, 4, 5, 6, 8.
3. Add Upstash secrets via `add_secret` tool (items 1 only).
4. Tests (item 3) last so they cover the new `is_visible` policy.

## Files touched (new ✚, edited ✎)

```text
✚ supabase/migrations/<ts>_moderation_visibility_indexes.sql
✚ src/integrations/upstash/ratelimit.server.ts
✚ src/lib/moderation.server.ts
✚ src/lib/ledger-read.functions.ts        (getBusinessLedger, setVisibility)
✚ src/routes/admin.moderation.tsx
✚ src/__tests__/rls/setup.ts
✚ src/__tests__/rls/reviews.rls.test.ts
✚ src/__tests__/rls/owner-responses.rls.test.ts
✚ src/__tests__/rls/rewards.rls.test.ts
✚ vitest.config.rls.ts
✎ src/routes/api/summarize.ts             (Upstash, drop in-memory bucket)
✎ src/lib/ledger.functions.ts             (call moderation pre-insert)
✎ src/hooks/use-auth.tsx                  (TOKEN_REFRESHED, focus refresh)
✎ src/routes/restaurants.$slug.tsx        (useInfiniteQuery)
✎ src/server.ts                           (asset cache headers)
✎ src/components/Nav.tsx                  (admin moderation link)
✎ package.json                            (test:rls script)
✎ docs/SECURITY.md                        (rate-limit resolved, moderation, visibility RLS)
✎ README.md                               (RLS test env vars, moderation note)
✎ CHANGELOG.md                            ([1.1.0] — substantive feature bump)
```

## Out of scope (deferred to a later plan)

- Section 3 features (i18n, photo uploads, QR, analytics, directory).
- Section 4 (CI/CD, Playwright, Renovate, contribution guide).
- Section 5 (landing page, badges, OSS community).
- Quick wins (OG tags, dark mode, friendly reward codes, share button).

## Risks & mitigations

- **Upstash availability** — fail-open + log; rate-limit is a cost guardrail, not a security boundary, so this is acceptable.
- **AI moderation latency** (~500ms per write) — acknowledged; mitigated by fail-open and pre-screen running in parallel with sanitisation, not after.
- **RLS test project cost** — kept off CI default; user runs manually with `bun run test:rls` after setting the three env vars.
- **Pagination + cache invalidation** — cache key is bound to `max(updated)` so first page invalidates immediately on a new review; nested pages stay valid.
