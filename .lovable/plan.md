# Close audit gaps (docs + PWA install + streaming polish)

The audit conflates "not present in repo" with "not implemented." Migrations, RLS, CHECK constraints, the immutability trigger, Zod validation, and SSE streaming all exist. The genuine gaps are documentation, an install manifest, and verifying the streaming UI.

## 1. Documentation

**`README.md`** (root)
- Product mission + objectives (verbatim from project knowledge)
- Architecture overview: TanStack Start + Lovable Cloud (Supabase), `createServerFn` as the server layer, no Edge Functions by design
- Personas + access model (admin / restaurateur / patron, `has_role()` + `is_business_member()`)
- Local dev / build commands
- **Audit reconciliation** section: explicitly maps each "missing" claim to the file/policy that already implements it (migrations paths, RLS policy names, the `prevent_used_at_overwrite` trigger, `src/routes/api/summarize.ts` for streaming, why Edge Functions are intentionally absent)

**`.lovable/instructions.md`** — persistent AI directives
- Security: no `service_role` in client; all writes go through `createServerFn` with `requireSupabaseAuth`; Zod-validated; RLS-scoped by `auth.uid()`
- Architecture: strict TS, no `any`; three-state pattern (Loading skeleton / Authorized / `AccessDenied`); `// @business-logic` and `// @complexity-explanation` tags
- UI: streaming token-by-token for AI; Stop button; mobile-first chat bubbles (right=patron/forest, left=owner/muted)
- Immutability invariants: reviews/owner_responses are append-only; `used_at` flips once

**`docs/SECURITY.md`** — security model reference
- Table-by-table RLS matrix (who can SELECT/INSERT/UPDATE/DELETE and under what predicate)
- Database-level guarantees: CHECK constraints (rating 1–5, content length 10–1000 / 10–500), UNIQUE one-response-per-review, `prevent_used_at_overwrite` trigger
- Validation pipeline: Zod sanitize → server fn → RLS → trigger
- `/api/summarize` auth + prompt-injection mitigations (server-fetched content, sanitization)
- Validation checklist (the four bullets from the project knowledge)

**`CHANGELOG.md`**
- `v1.0.0 — Verified Rewards & Immutable Ledger` pinning current behaviour

## 2. PWA install (manifest only, no service worker)

Per platform guidance, service workers break the Lovable preview iframe. Install-only manifest is enough for "Add to Home Screen."

- `public/manifest.webmanifest` — name "TasteLedger", short_name, `display: "standalone"`, `start_url: "/"`, `theme_color`/`background_color` from forest/cream tokens, icons array
- `public/icon-192.png`, `public/icon-512.png` — generate via imagegen (cream background, forest "TL" monogram in serif)
- `<link rel="manifest" href="/manifest.webmanifest">` + `theme-color` meta in `src/routes/__root.tsx` head
- `<link rel="apple-touch-icon">` for iOS home-screen
- Small "Install on your phone" hint card on `/account` (no JS install prompt — keep simple)

No service worker, no `vite-plugin-pwa`, no offline cache.

## 3. Streaming UI verification

Audit `src/routes/restaurants.$slug.tsx` `AISummaryPanel`:
- Confirm SSE chunks append to state on each `data:` event (not buffered until completion)
- Confirm Stop button calls `controller.abort()` and resets state cleanly
- Add a subtle pulsing cursor `▍` at the end of the streaming text while `isStreaming` is true
- If buffering is found, switch to per-chunk `setSummary(prev => prev + delta)`

## 4. Out of scope (explicitly)

- Supabase Edge Functions — TanStack Start uses `createServerFn`; duplicating is anti-pattern per framework docs
- Service worker / offline cache — breaks preview, ships stale shells to installed PWAs
- New migrations — current schema satisfies all stated invariants
- CI/CD workflows — Lovable handles build/deploy; `.github/workflows` is not the right surface here

## Files touched

- `README.md` (new)
- `.lovable/instructions.md` (new)
- `docs/SECURITY.md` (new)
- `CHANGELOG.md` (new)
- `public/manifest.webmanifest` (new)
- `public/icon-192.png`, `public/icon-512.png` (new, generated)
- `src/routes/__root.tsx` (head links)
- `src/routes/account.tsx` (install hint card)
- `src/routes/restaurants.$slug.tsx` (streaming UI polish if needed)
