# Follow-up hardening plan

Four small, scoped items. No schema changes. No business-logic changes to the ledger or rewards.

## 1. Per-user rate limit on `/api/summarize`

The platform has no rate-limit primitive (per `<no-backend-rate-limiting>`), so we do an in-memory token bucket keyed by `claims.sub`. Honest best-effort, documented as such.

- Add a `RATE_LIMIT` map in `src/routes/api/summarize.ts`: `Map<userId, { tokens: number, refilledAt: number }>`.
- Bucket: 10 requests per 10 minutes per user, refill linearly.
- On exceed → `429` with `Retry-After` header, no upstream call.
- Update `docs/SECURITY.md` "Known gaps" to reflect the new bucket and its single-instance limitation.
- Update `CHANGELOG.md` (`[1.0.2]`).

## 2. Testing — minimal but real

README currently has zero test mention. Add a thin Vitest harness focused on the highest-leverage pure logic:

- `bun add -D vitest @vitest/ui`
- `vitest.config.ts` (jsdom, alias `@` → `src`)
- `src/lib/__tests__/schemas.test.ts` — bounds + sanitisation (script tag stripped, control chars, length 9 rejected, length 10 accepted, length 1001 rejected).
- `src/routes/api/__tests__/summarize-sanitize.test.ts` — `sanitizeForPrompt` neutralises `\nSYSTEM:` injection and caps length.
- Add `"test": "vitest run"` to `package.json`.
- README: new "Testing" section with `bun test` instructions and what is / isn't covered (no e2e, no DB integration).

Out of scope: RLS integration tests (require a live test project), Playwright/e2e.

## 3. Offline support — decision record

Codify the existing decision so future audits stop re-flagging it.

- New `docs/ADR-001-no-service-worker.md` documenting:
  - Lovable preview iframe + stale-install hazard.
  - PWA manifest + icons retained for "Add to Home Screen".
  - Re-evaluation triggers (custom domain on production, native wrapper, etc.).
- Link from README's Audit Reconciliation footnote.

## 4. Load-test script for AI + reward flows

Single Node script, not wired into CI. Lives in `scripts/loadtest.ts`. User runs manually against preview/published.

- Uses `undici` (already transitive) or native `fetch`, no new prod deps; `bun add -D tsx` if not present.
- Two scenarios:
  - `summarize`: N concurrent authenticated POSTs to `/api/summarize` for one `business_id`, measures p50/p95/p99 latency, cache hit rate (via `X-Summary-Cache` header), 429 count.
  - `redeem`: N concurrent attempts to redeem the **same** `reward_id` — must observe exactly 1 success, N-1 "already redeemed" errors (validates the atomic UPDATE + trigger).
- Reads `LOADTEST_BEARER`, `LOADTEST_BASE_URL`, `LOADTEST_BUSINESS_ID`, `LOADTEST_REWARD_ID` from env.
- Output: plain-text report to stdout.
- README: short "Load testing" subsection with the env vars and example invocation.

## Files touched

```text
src/routes/api/summarize.ts        (rate limit)
src/lib/__tests__/schemas.test.ts  (new)
src/routes/api/__tests__/summarize-sanitize.test.ts (new)
vitest.config.ts                    (new)
package.json                        (test script, devDeps)
scripts/loadtest.ts                 (new)
docs/SECURITY.md                    (rate-limit note)
docs/ADR-001-no-service-worker.md   (new)
README.md                           (Testing + Load testing + ADR link)
CHANGELOG.md                        ([1.0.2])
```

## Out of scope (explicitly)

- Service worker implementation (covered by ADR-001).
- Distributed rate limiting (no platform primitive yet).
- E2E browser tests.
- Database migrations.
- Any change to RLS, triggers, or reward state machine.
