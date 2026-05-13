# Operations runbook

## Backups

Lovable Cloud (Supabase under the hood) provides automated backups. To enable
**Point-in-Time Recovery** (PITR):

1. Open the project in Lovable.
2. Cloud → Database → Backups.
3. Enable **PITR** (paid tier). Default retention: 7 days.
4. Verify a recovery once per quarter against a staging project.

Daily logical exports are also recommended for disaster recovery off-site.
Cloud → Database → Tables → Export (CSV per table). Automate via a scheduled
job that calls the Supabase REST API with the service-role key from a secured
CI runner — never from a browser.

## Rate-limit tuning

Limits are configured in code, not env (cheaper to audit):

| Surface | Per user | Per IP | Per business | Window |
|---|---|---|---|---|
| `/api/summarize` | 10 | 60 | — | 10 min |
| `submitReview` | 10 | — | — | 1 hr |
| `submitOwnerResponse` | — | — | 30 | 1 hr |

Bump in `src/routes/api/summarize.ts` and `src/lib/ledger.functions.ts`.

## Incident playbook

1. **Spike in 429s** — check Upstash dashboard for `rl:*` key counts. If
   legitimate traffic, raise limits in code; if abusive, add the offending IP
   to a Cloudflare WAF block.
2. **Moderation false positives** — admins toggle `is_visible=true` from
   `/admin/moderation`. Content remains immutable.
3. **Compromised admin account** — revoke role with
   `DELETE FROM user_roles WHERE user_id = '<uid>' AND role = 'admin';`
   then rotate any service-role-bearing CI secrets.

## Auth hardening checklist

- [ ] Email confirmation required (default; do not disable).
- [ ] HIBP password check enabled (`password_hibp_enabled: true`).
- [ ] MFA (TOTP) enabled by every admin and restaurateur — see `/account/security`.
- [ ] Turnstile site key configured (`VITE_TURNSTILE_SITE_KEY`) for signup CAPTCHA.

## Secrets inventory

| Secret | Used by | Notes |
|---|---|---|
| `LOVABLE_API_KEY` | `/api/summarize` | Managed; rotate via dashboard |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiter | Free tier sufficient at current scale |
| `TURNSTILE_SECRET_KEY` | `verifyCaptcha` server fn | Cloudflare Turnstile |
| `SENTRY_DSN` | client + server error capture | Browser-safe |