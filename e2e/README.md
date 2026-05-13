# Playwright end-to-end tests

These run in CI only — they need a real running app and disposable test users.
They will **not** run inside the Lovable sandbox.

## Required env (set as GitHub Actions secrets)

- `PLAYWRIGHT_BASE_URL` — defaults to `http://localhost:4173` (Vite preview)
- `E2E_PATRON_EMAIL`, `E2E_PATRON_PASSWORD` — disposable patron account
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — disposable admin account (for redeem-flow seeding)
- `E2E_BUSINESS_SLUG` — slug of a seeded test business

## Run locally

```bash
bun run build
bun run preview &
bun run test:e2e
```