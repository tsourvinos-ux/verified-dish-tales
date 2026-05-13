# Backlog rollout — 4 phases

You picked all four tracks. That is a large amount of surface area; I am proposing to ship it in **four sequential phases** so each one can be reviewed and reverted independently. Approve once and I'll execute Phase 1 → 4 in order, pausing only where a secret or external action is required.

---

## Phase 1 — Setup & visibility (low risk, fast)

| # | Item | Notes |
|---|---|---|
| 1.1 | `LICENSE` (AGPL-3.0) | Full GNU AGPL v3 text at repo root. Add SPDX header note in `README.md`. |
| 1.2 | `package.json` portability | Add `engines: { bun: ">=1.1", node: ">=20" }`. Add npm-equivalent scripts (`dev`, `build`, `test`, `lint`) that delegate to `bunx`/`vite` so `npm run` works without Bun for evaluators. Keep Bun as primary. |
| 1.3 | Open Graph image | Generate 1200×630 PNG (`public/og-image.png`) using imagegen, branded with TasteLedger marks. Wire into root route `head()` (`og:image`, `twitter:image`). |
| 1.4 | GitHub repo metadata doc | Add `docs/REPO-METADATA.md` listing the topics + description for the user to paste into GitHub (Lovable agent cannot set repo settings). |
| 1.5 | `CHANGELOG.md` entry | Bump to `[1.2.0]`. |

**Out of scope deliberately**: actually editing GitHub repo description/topics — that is a GitHub UI action only the user can do.

---

## Phase 2 — Security & production hardening

| # | Item | Notes |
|---|---|---|
| 2.1 | Global IP rate limit | Extend `ratelimit.server.ts` with a second key per request: `rl:summarize:ip:{ip}` (60 req/10 min). Read IP from `CF-Connecting-IP` / `X-Forwarded-For`. Apply in `/api/summarize` *and* `submitReview` / `submitOwnerResponse` server fns. Per-business cap on response submission: `rl:resp:biz:{business_id}` (30/hour). |
| 2.2 | Bun audit + Dependabot | `.github/workflows/audit.yml` (weekly + on PR) running `bun audit`. `.github/dependabot.yml` for npm + actions ecosystems, weekly cadence, grouped minor/patch. |
| 2.3 | Auth hardening | `supabase--configure_auth` with `password_hibp_enabled: true` (already noted in plan but verify). Document in `docs/SECURITY.md` how restaurateur/admin promotion requires email verification (already enforced by trigger — confirm). |
| 2.4 | MFA (TOTP) for restaurateur/admin | New `/account/security` page using `supabase.auth.mfa.enroll/challenge/verify`. **Soft-enforce**: warning banner on `/admin` and restaurateur dashboards if no MFA factor; hard-block toggle deferred (would lock out current admin during rollout). |
| 2.5 | Turnstile CAPTCHA on signup | Cloudflare Turnstile (free, edge-native, no email needed). Add `VITE_TURNSTILE_SITE_KEY` (public, in code) + `TURNSTILE_SECRET_KEY` secret. Add widget to `/login` signup tab; server-side verify in a new `verifyCaptcha` server fn called before `supabase.auth.signUp`. |
| 2.6 | Backups doc | Add `docs/OPERATIONS.md` describing PITR + nightly export. Lovable Cloud paid tier has PITR — instruct user to enable in Cloud → Database → Backups. |

**Note on rate limiting**: Lovable's general guidance is to avoid ad-hoc rate limiting, but you already have Upstash wired up and an explicit cost-control reason. Keeping it.

**Will request secrets**: `TURNSTILE_SECRET_KEY` (one prompt, blocks 2.5 only).

---

## Phase 3 — CI/CD, E2E tests & observability

| # | Item | Notes |
|---|---|---|
| 3.1 | GitHub Actions CI | `.github/workflows/ci.yml`: matrix on Bun, runs `tsc --noEmit`, `eslint`, `bun run test` (vitest). Triggered on PR + push to `main`. |
| 3.2 | RLS integration tests | Already planned — wire into CI as a separate optional job that only runs if `TEST_SUPABASE_URL` repo secret is set (skipped otherwise so PRs from forks don't fail). |
| 3.3 | Playwright E2E | `playwright.config.ts` + `e2e/` folder. Two specs to start: `review-flow.spec.ts` (signup → submit review → see in ledger), `redeem-flow.spec.ts` (admin mints reward → patron redeems → second redeem fails). CI job runs them against a `bun run preview` build. **Cannot run inside the Lovable sandbox** — these execute in CI only. |
| 3.4 | Sentry integration | `@sentry/react` for the browser bundle (initialised in `src/start.ts`), and a thin manual `captureException` helper in `src/lib/sentry.server.ts` posting to Sentry's HTTP envelope endpoint (the official `@sentry/node` SDK is Node-only and incompatible with Cloudflare Workers; `@sentry/cloudflare` requires a Wrangler-specific entry we don't expose). Wire helper into all `createServerFn` error paths and `/api/summarize`. PII scrubber strips `email`, `content`, `code`. |
| 3.5 | X-Request-ID tracing | Generate `crypto.randomUUID()` in `src/server.ts` if request lacks `X-Request-ID`, attach to response headers, propagate to console logs and Sentry tags. |
| 3.6 | Error boundary | `src/components/RootErrorBoundary.tsx` wrapping the app inside `__root.tsx`, reports to Sentry with the request-ID. |

**Will request secrets**: `SENTRY_DSN` (browser-safe, also used server-side), `SENTRY_AUTH_TOKEN` (only if we add source-map upload — optional, deferred).

---

## Phase 4 — Features, polish & docs

| # | Item | Notes |
|---|---|---|
| 4.1 | Multi-language AI summaries + citations | Extend `/api/summarize` payload with `locale` (BCP-47, Zod-enum of `en`/`es`/`fr`/`de`/`it`/`pt`/`zh`/`ja`). Update prompt to instruct model to (a) output in target locale and (b) end each claim with `[#<review_id_short>]` markers. Client renders markers as anchor links scrolling to the source review. |
| 4.2 | Public analytics dashboard | New route `/restaurants/$slug/insights`. Server fn `getBusinessInsights(business_id)` returning aggregate-only data (avg rating, rating histogram, review count by month, redemption rate) — **no PII, no per-user rows**, RLS-safe via existing public `reviews` policy. Charts via existing `recharts`. |
| 4.3 | Multi-business switcher | Restaurateurs with multiple memberships get a header dropdown; persists active business in `localStorage`. Existing `business_profile_membership` table already supports many-to-many — no migration. |
| 4.4 | ADRs | `docs/ADR-002-rate-limit-upstash.md`, `docs/ADR-003-moderation-pipeline.md`, `docs/ADR-004-sentry-on-workers.md`. |
| 4.5 | API reference | `scripts/gen-api-docs.ts` — walks `src/lib/*.functions.ts`, extracts Zod schemas via `zod-to-json-schema`, writes `docs/API.md`. Run in `prepare` script. |
| 4.6 | `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` | Standard Contributor Covenant 2.1 + AGPL contribution note (DCO sign-off recommended). |
| 4.7 | Demo link in README | Use the existing `https://lodger.lovable.app` published URL. Optional read-only demo patron account documented with credentials in README — only if you want public access (will ask before creating). |

### Excluded from Phase 4 (with reason)

- **Service-worker offline queue** — directly contradicts `docs/ADR-001-no-service-worker.md` (the ledger's append-only invariant cannot tolerate offline writes that may conflict on sync). Recommend keeping the ADR; if you want this anyway, we'd need to amend the ADR first.

---

## Files touched (summary)

```text
Phase 1 ✚ LICENSE, public/og-image.png, docs/REPO-METADATA.md  ✎ package.json, README.md, src/routes/__root.tsx, CHANGELOG.md
Phase 2 ✚ docs/OPERATIONS.md, src/routes/account.security.tsx, src/lib/captcha.functions.ts  ✎ src/integrations/upstash/ratelimit.server.ts, src/routes/api/summarize.ts, src/lib/ledger.functions.ts, src/routes/login.tsx, src/components/Nav.tsx, .github/workflows/audit.yml, .github/dependabot.yml, docs/SECURITY.md
Phase 3 ✚ .github/workflows/ci.yml, .github/workflows/e2e.yml, playwright.config.ts, e2e/review-flow.spec.ts, e2e/redeem-flow.spec.ts, src/lib/sentry.server.ts, src/lib/sentry.client.ts, src/components/RootErrorBoundary.tsx  ✎ src/start.ts, src/server.ts, src/routes/__root.tsx, multiple *.functions.ts (sentry capture)
Phase 4 ✚ src/routes/restaurants.$slug.insights.tsx, src/lib/insights.functions.ts, src/components/BusinessSwitcher.tsx, scripts/gen-api-docs.ts, docs/ADR-002…004.md, docs/API.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md  ✎ src/routes/api/summarize.ts (locale + citations), src/components/Nav.tsx, README.md
```

## Migrations

None. Phase 4 insights uses existing tables. MFA (Phase 2) uses Supabase's built-in `auth.mfa_*` tables — no migration required.

## Approval gates inside execution

I will pause for **two secret prompts**:
1. End of Phase 2 step 2.5 → `TURNSTILE_SECRET_KEY` (you'll also need to register a Turnstile site in Cloudflare and give me the public site key inline).
2. Start of Phase 3 step 3.4 → `SENTRY_DSN` (create a Sentry project first; DSN is the only required value).

Everything else proceeds without prompts.

## Risks

- **AGPL-3.0** is copyleft — anyone running a modified version as a network service must release source. Confirm this is intended (you picked it explicitly, so I'll proceed unless you say otherwise).
- **Sentry on Cloudflare Workers** — official `@sentry/node` SDK doesn't run in Workers. Plan uses `@sentry/react` (client) + a hand-rolled HTTP envelope poster (server). Less feature-rich than `@sentry/node` (no auto-instrumentation) but the tradeoff is documented in ADR-004.
- **Playwright** runs in CI only. Local-in-sandbox execution is not supported.
- **CAPTCHA on signup** adds a Cloudflare dependency to login UX. Acceptable given Workers hosting.