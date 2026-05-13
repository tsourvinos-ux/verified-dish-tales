# Contributing to TasteLedger

Thank you for your interest! This project is **AGPL-3.0-or-later** — by contributing
you agree your contribution is licensed under the same terms.

## Quick start

```bash
bun install
bun run dev
```

Run tests + typecheck before opening a PR:

```bash
bun run typecheck
bun run lint
bun run test
```

## Hard rules

These are enforced in `.lovable/instructions.md` and apply to every PR:

1. No `any` types.
2. No `service_role` imports outside `*.server.ts`.
3. Every Zod schema lives in `src/lib/schemas.ts` (or inline for admin-only paths) — never trust client input.
4. RLS predicates must filter by `auth.uid()` + ownership join; the server fn still sets `user_id` from `context.userId`.
5. The ledger is **append-only**. `reviews` and `owner_responses` cannot gain UPDATE/DELETE policies. The `is_visible`/`moderation_reason` columns are the only mutable fields, admin-gated.

See `docs/SECURITY.md` for the full RLS matrix.

## DCO

Sign your commits with `git commit -s` (Developer Certificate of Origin). Required for AGPL provenance.

## Reporting security issues

Email security reports privately rather than opening a public issue. We aim to respond within 72 hours.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Be excellent.