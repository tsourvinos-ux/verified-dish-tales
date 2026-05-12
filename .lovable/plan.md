## Verified Restaurant Review Ledger — Build Plan

A zero-trust ledger app where patrons leave reviews, restaurateurs post immutable responses, and patrons earn single-use Verified Rewards. Mobile-first chat-style feed with PWA install + AI summaries.

### 1. Backend foundation (Lovable Cloud)

Enable Lovable Cloud, then create schema via migration:

- `app_role` enum: `admin`, `restaurateur`, `patron`
- `user_roles` (user_id, role) — roles **never** on profiles. `has_role()` security-definer fn.
- `profiles` (id → auth.users, display_name, is_verified)
- `businesses` (id, name, slug, cuisine, address, cover_url, created_by)
- `business_profile_membership` (business_id, user_id, role) — ownership join
- `reviews` (id, business_id, user_id, rating 1–5, content text, created_at)
  - CHECK length 10–1000, immutable (no UPDATE/DELETE policy)
- `owner_responses` (id, review_id, business_id, author_id, content, created_at)
  - CHECK `char_length(content) BETWEEN 10 AND 500`, one response per review (UNIQUE), immutable
- `verified_rewards` (id, user_id, business_id, code, title, expiry_date, used_at, created_at)
  - CHECK `used_at IS NULL OR used_at >= created_at`
  - Trigger `prevent_used_at_overwrite`: raises if `OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at`

RLS (every table, no service-role usage in client):
- `reviews`: SELECT public; INSERT `auth.uid() = user_id`; no UPDATE/DELETE
- `owner_responses`: SELECT public; INSERT requires `EXISTS (SELECT 1 FROM business_profile_membership m WHERE m.user_id = auth.uid() AND m.business_id = NEW.business_id)`; no UPDATE/DELETE
- `verified_rewards`: SELECT `auth.uid() = user_id`; UPDATE only by owner and only flipping `used_at` from NULL → now() (column-grant + WITH CHECK); admin INSERT via edge function
- `businesses`: SELECT public; admin-only writes via `has_role(uid,'admin')`
- `user_roles`, `business_profile_membership`: admin-managed; user can SELECT own rows

Admin provisioning: seed one admin via SQL migration (instruct user to assign their auth user id post-signup, OR auto-promote first signup with documented note). Admin UI lets admin create businesses, assign restaurateur memberships, mint rewards.

### 2. Edge Functions (gatekeepers, Zod-validated)

All write paths go through edge functions that re-validate with Zod and use the **caller's JWT** (not service role) so RLS still enforces:

- `submit-review` — Zod {business_id uuid, rating 1–5, content 10–1000}, sanitize, insert
- `submit-owner-response` — Zod {review_id, business_id, content 10–500}, sanitize, insert
- `redeem-reward` — Zod {reward_id}; updates `used_at = now()` where `used_at IS NULL AND expiry_date > now()`; returns redemption proof
- `mint-reward` (admin) — Zod {user_id, business_id, title, expiry_date}
- `summarize-reviews` — streaming SSE proxy to Lovable AI Gateway (`google/gemini-3-flash-preview`); supports AbortController for Stop button
- `verify-jwt = true` on all of them; sanitization strips `<script>` and control chars

### 3. Frontend (TanStack Start, file-based routes)

Public:
- `/` — landing + featured restaurants grid (seeded)
- `/restaurants/$slug` — restaurant header, **chat-style ledger feed** (right-aligned branded review bubbles, left-aligned gray response bubbles, timestamps, "Verified" badge by owner name), AI summary panel with Stop button
- `/login`, `/signup`

Authenticated (`_authenticated` layout, gated `beforeLoad`):
- `/account` — profile, my reviews, **my rewards** wallet (filters expired client-side, shows Active/Used)
- `/restaurants/$slug` review composer (patron) or response composer (restaurateur, only if membership matches)
- `/admin` (role-gated by `has_role('admin')`) — create business, assign restaurateur, mint reward

Shared:
- `AccessDenied` component, `Skeleton`-based loading; every protected component handles Loading / Authorized / Unauthorized
- Zod schemas in `src/lib/schemas.ts` (single source for client + edge fn). Submit buttons disabled when invalid (10–500 / 10–1000)
- Strict TS, no `any`. `// @business-logic` tags on reward redemption + response insert paths

### 4. PWA

Install-only manifest (no service worker — preview-safe per platform guidance):
- `public/manifest.webmanifest` with icons, `display: "standalone"`, `start_url: "/"`
- Link tag in root head; install prompt component on `/account`

(Full offline service worker is risky in the Lovable preview iframe; flagged as a follow-up if user insists.)

### 5. AI Summaries (streaming)

`/restaurants/$slug` page has "Generate ledger summary" button → fetches `/functions/v1/summarize-reviews` with SSE, renders tokens incrementally, Stop button calls `controller.abort()`. Handles 402/429 with toasts.

### 6. Seed data

Migration inserts ~5 demo restaurants with cover images + a handful of seeded reviews so the feed isn't empty.

### 7. Design

Mobile-first, chat-bubble feed. I'll generate 3 design directions before building so you can pick the visual language (palette, typography, bubble treatment, badge style).

### Build order

1. Enable Lovable Cloud, schema migration + RLS + trigger + seed
2. Auth (email/password + Google), `_authenticated` guard, profile auto-create trigger
3. Design directions → pick one → tokens into `styles.css`
4. Public restaurant pages + ledger feed UI
5. Review + owner-response composers + edge functions
6. Rewards wallet + redemption edge function
7. Admin console (create business, assign restaurateur, mint reward)
8. AI summary streaming + Stop
9. PWA manifest
10. Security scan pass