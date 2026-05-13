# Security model — TasteLedger

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| Review content | Tampering / deletion after publish | No UPDATE/DELETE policies on `reviews` |
| Owner response | Restaurateur edits a damaging response | No UPDATE/DELETE on `owner_responses`; UNIQUE on `review_id`; INSERT gated by ownership join |
| Reward | Double-redemption | Atomic UPDATE filtered by `used_at IS NULL AND expiry_date > now()`; `prevent_used_at_overwrite` trigger |
| Reward | Tampering with code/expiry post-mint | Trigger raises if any column other than `used_at` changes |
| Staff identity | Enumeration via membership table | `business_profile_membership` SELECT restricted to self or admin |
| AI summary | Prompt injection from review text | Server fetches reviews; sanitises angle-brackets/backticks; treats text as data in system prompt |
| AI summary | Anonymous abuse / cost | `/api/summarize` requires Bearer token; rejected without valid Supabase claims |
| AI summary | Cross-isolate spam | Per-user 10/10min rate limit via Upstash Redis (distributed, fail-open) |
| Toxic / harmful content | Slips through into ledger | Pre-write moderation via Lovable AI; `is_visible=false` hides hidden rows from public reads via RLS |

## RLS matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `businesses` | public | admin only | admin only | admin only |
| `profiles` | public¹ | self (`auth.uid() = id`) | self | — |
| `user_roles` | self or admin | admin | admin | admin |
| `business_profile_membership` | self or admin | admin | admin | admin |
| `reviews` | public | self (`auth.uid() = user_id`) | **denied** | **denied** |
| `owner_responses` | public | `is_business_member(auth.uid(), business_id)` AND `auth.uid() = author_id` | **denied** | **denied** |
| `verified_rewards` | self (`auth.uid() = user_id`) | admin | self, only flipping `used_at` from NULL | — |

¹ `profiles` exposes only `display_name` and `is_verified`; both are required to attribute reviews/responses on public pages. No PII is stored.

## Database-level guarantees

- `reviews.rating` — `CHECK (rating BETWEEN 1 AND 5)`.
- `reviews.content` — length bounded 10–1000 in Zod (see [§ Validation pipeline](#validation-pipeline)).
- `owner_responses.content` — `CHECK (char_length(content) BETWEEN 10 AND 500)`.
- `owner_responses` — `UNIQUE (review_id)` enforces one response per review.
- `verified_rewards` — `prevent_used_at_overwrite()` trigger raises on any post-redemption mutation:

  ```sql
  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'Reward already redeemed; used_at is immutable';
  END IF;
  ```

- `verified_rewards` UPDATE policy `WITH CHECK ((auth.uid() = user_id) AND (used_at IS NOT NULL))` — patron can only set `used_at`, never null it.

## Validation pipeline

```text
UI form ──► Zod (form schema, live char-count)
    │
    ▼
createServerFn ──► Zod (transform: sanitise XSS, then bounds-check)
    │   (sanitise = strip <script>, all HTML tags, control chars)
    ▼
supabase.from(...).insert() as caller's JWT
    │
    ▼
RLS predicate ──► CHECK constraint ──► (verified_rewards: trigger)
```

Each layer assumes the layer above is hostile.

## `/api/summarize` hardening

- Auth: requires `Authorization: Bearer <supabase-jwt>`; validated via `supabase.auth.getClaims(token)`.
- Input: `business_id` only (Zod `uuid()`); review content is **not** accepted from the client.
- Server fetches `businesses.name` and `reviews.content` for the given business, sanitises (strips `<>` and backticks, collapses whitespace, caps each review at 1000 chars; business name capped at 80), then interpolates into a system prompt that instructs the model to treat review text strictly as data.

## Validation checklist (per release)

- [ ] Pre-transaction Zod check enforced in every `createServerFn` write.
- [ ] Length bounds hard-coded in Zod (10–500 owner_responses, 10–1000 reviews).
- [ ] 100% TypeScript coverage; no `any`.
- [ ] Sanitisation strips executable scripts before storage.
- [ ] No `service_role` imports outside `*.server.ts`.
- [ ] Security scan passes (or remaining items are documented in `@security-memory`).

## Operational notes

- `auth-middleware.ts` validates the bearer token via `getClaims()` — does not call `getUser()` (avoids an extra round-trip and avoids trusting unverified user data).
- The browser Supabase client uses the publishable key only. The publishable key is safe in the bundle.
- The service-role key is never imported by any module reachable from `src/routes/__root.tsx`.

## Known gaps

- **Rate limiting on `/api/summarize` is best-effort.** A per-user in-memory token bucket (10 requests / 10 min, keyed by `claims.sub`) sheds excess traffic with a `429` + `Retry-After`. Because state lives in a single Worker isolate it is **not** a hard distributed limit — concurrent isolates each enforce their own bucket. Combined defences:
  1. Auth required (`Bearer <jwt>`) — anonymous traffic is rejected.
  2. Per-user token bucket as above.
  3. `limit` clamped to 5–40 reviews per request via Zod.
  4. Server-side LRU cache (5-min TTL, key includes review count + latest `created_at`) — repeated summaries for the same business are served from memory.
  5. `Cache-Control: private, max-age=60` so browsers/clients also reuse responses.

  A platform-level distributed limiter will replace this when available.