## Audit reconciliation — the repo already satisfies the audit

The audit you pasted assumes a 44-min-old empty scaffold. The actual state:

| Audit claim | Reality |
|---|---|
| "No migrations in /supabase" | 4 migrations exist (tables, RLS, immutability trigger, perf indexes) |
| "No Zod schemas" | `src/lib/schemas.ts` — sanitised pipes for reviews / responses / rewards |
| "No `owner_responses` impl" | Table + UNIQUE(review_id) + 10–500 CHECK + INSERT-only RLS |
| "No verified rewards lifecycle" | Table + `prevent_used_at_overwrite` trigger + atomic redeem in `ledger.functions.ts` |
| "No Zero-Trust SQL" | Every server fn uses `requireSupabaseAuth`; RLS scoped by `auth.uid()` |
| "No `any` types" | Only generated `routeTree.gen.ts` (untouchable) uses `as any` |
| "No three-state UI" | `AccessDenied.tsx` + skeletons in route components |
| "No PWA" | `manifest.webmanifest` + 192/512 icons + apple-touch tags |

### Real remaining gaps (worth doing)

1. **Service worker** — manifest exists but no SW, so "offline cached ledger" from the brief isn't delivered. Add `public/sw.js` (network-first for HTML, cache-first for static assets, skip `/api/*`) + register in `__root.tsx` (client-only, prod-only).
2. **ESLint guard against `any`** — add `@typescript-eslint/no-explicit-any: error` and `no-unsafe-*` warns in `eslint.config.js`, with `src/routeTree.gen.ts` ignored.
3. **Note the reconciliation** — append a one-line "Audit dated YYYY-MM-DD reconciled — see commit log" to README's existing Audit Reconciliation section so future re-audits don't re-flag this.

### Out of scope (already done or would be regressions)

- Moving schemas to `/src/lib/validation/` — pure churn, current `src/lib/schemas.ts` is correct.
- Adding Supabase Edge Functions — platform policy says use `createServerFn` (already done); Edge Functions would be a regression.
- Service-role audit — already enforced via `client.server.ts` + import-graph rules.

### Files touched

- `public/sw.js` (new)
- `src/routes/__root.tsx` (register SW client-side, prod-only)
- `eslint.config.js` (no-explicit-any rule + ignore generated file)
- `README.md` (one-line reconciliation note)
- `CHANGELOG.md` (v1.0.1 — Offline ledger + lint guard)

No DB migrations, no schema changes, no business-logic changes.
