## Plan: Performance & Security Hardening

Address 7 of 8 reported issues. Skipping #8 (rate limiting) — backend has no rate-limiting primitives yet (platform policy); will note in README instead.

### 1. Summary endpoint efficiency (`src/routes/api/summarize.ts`)
- Accept optional `limit` in body (Zod `number().int().min(5).max(40).default(15)`); default lowered from 40 → 15.
- Add server-side in-memory LRU cache keyed by `business_id + reviewCount + latestReviewCreatedAt` with 5-min TTL. First fetch `count` + latest `created_at` cheaply, return cached stream replay if hit.
- Add `Cache-Control: private, max-age=60` header on the streamed response.

### 2. DB indexes (new migration)
```sql
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup
  ON public.user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_business_membership_lookup
  ON public.business_profile_membership(user_id, business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user
  ON public.reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_author
  ON public.owner_responses(author_id);
CREATE INDEX IF NOT EXISTS idx_rewards_business
  ON public.verified_rewards(business_id, expiry_date DESC);
```

### 3 & 4 & 6. Auth hook hardening (`src/hooks/use-auth.tsx`)
- Replace `setTimeout(..., 0)` with `queueMicrotask` (still defers past the auth callback so the JWT is attached, but no 16ms macrotask delay).
- Switch `Promise.all` → `Promise.allSettled`; on rejection keep previous state and `console.error`; never silently null-out roles.
- Wrap `loadProfile` in `useCallback`; gate re-fetch by `userId` change only (already effectively the case, but make explicit).
- Add a 5-minute in-memory cache (`Map<userId, { roles, memberships, fetchedAt }>`) so remounts of `AuthProvider` (HMR, route transitions) don't refire two queries.
- Note: not migrating to `react-query` for auth — `AuthProvider` is a singleton context and the cache above gives us SWR semantics without restructuring the provider tree. (TanStack Query stays for route-level data.)
- NOT reading roles from `user_metadata`: roles live in `user_roles` table per the security model (`user_metadata` is user-writable and would be a privilege-escalation vector). Keep DB lookup; index from #2 makes it a single index hit.

### 5. Already covered by #2.

### 7. Prompt-injection hardening (`src/routes/api/summarize.ts`)
- Extend `sanitizeForPrompt` to also strip newlines/CR/tabs (already collapses `\s+` — confirm and tighten: replace ALL control chars `[\x00-\x1F\x7F]`).
- Wrap each review's content with `JSON.stringify` so quotes/backslashes are escaped and the model sees a clearly delimited string literal.
- Add explicit fence: each review on its own line as `Review N (R/5): <json-string>`, plus a trailing system reminder line.

### 8. Rate limiting — SKIP
Per platform policy, the backend lacks rate-limiting primitives. Document in `docs/SECURITY.md` under "Known gaps" that `/api/summarize` cost amplification is mitigated by (a) auth requirement, (b) `limit` cap of 40, (c) cache, and that proper rate limiting is deferred until platform support lands.

### Files touched
- `supabase/migrations/<new>.sql` (indexes)
- `src/routes/api/summarize.ts` (limit param, cache, sanitization, JSON-encoded reviews)
- `src/hooks/use-auth.tsx` (queueMicrotask, allSettled, useCallback, in-memory cache)
- `docs/SECURITY.md` (known-gaps note)

### Out of scope
- Migrating auth to TanStack Query (large refactor, no functional gain over the cache).
- Reading roles from JWT claims (security regression).
- Rate limiting (platform gap).
