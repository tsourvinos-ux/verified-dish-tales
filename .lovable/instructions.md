# Persistent AI directives — TasteLedger

These directives are **non-negotiable**. Future AI-assisted edits must comply.

## I. Security & data integrity

1. **Never** use `SUPABASE_SERVICE_ROLE_KEY` in client code, in shared modules, or in route loaders. Service-role access is permitted only inside server-only files explicitly named `*.server.ts` and called from a `createServerFn` handler.
2. **Never** bypass Zod validation. Every server function input goes through a Zod schema in `src/lib/schemas.ts` (or an inline schema for admin-only paths).
3. **Zero-trust queries**: every Supabase write must be filtered by `auth.uid()` and ownership-joined via `business_profile_membership` where business scope applies. RLS is the floor, not the ceiling — server functions must still set `user_id` from `context.userId`, never from client input.
4. **No `service_role` in suggestions.** If a request seems to require it, prefer redesigning with `requireSupabaseAuth` and RLS.

## II. Architecture

1. **Strict TypeScript.** The `any` type is prohibited. Use explicit interfaces or `unknown` + narrowing.
2. **Three-state pattern** for every protected component: Loading (`Skeleton` from `@/components/ui/skeleton`), Authorized (real UI), Unauthorized (`<AccessDenied />`).
3. **Logic tags** in source:
   - `// @business-logic` — reward minting, redemption, owner-response insertion, role checks
   - `// @complexity-explanation` — non-trivial state machines, async ordering subtleties
4. **DRY first.** Search `@/components/ui` and `@/lib` before creating new primitives.
5. **TanStack Start conventions.** Server logic = `createServerFn` in `src/lib/*.functions.ts`. HTTP-only endpoints (webhooks, SSE) = server routes under `src/routes/api/`. Never use Next.js patterns (`"use server"`, `getServerSideProps`).

## III. UI / UX

1. **Streaming AI** must render token-by-token (`setText(t => t + delta)` per chunk), never wait for full response.
2. **Stop button** mid-stream calls `controller.abort()` and resets state cleanly.
3. **Mobile-first chat bubbles** on the ledger feed:
   - Patron reviews — right-aligned, `bg-forest text-cream`
   - Owner responses — left-aligned, `bg-muted text-forest` with `Verified` badge
4. **Design tokens only.** Never hardcode hex/RGB; use semantic tokens from `src/styles.css` (`forest`, `cream`, `clay`, `muted`, etc.).

## IV. Immutability invariants

These are enforced at the database level. **Do not propose code or migrations that violate them.**

- `reviews` — append-only (no UPDATE/DELETE policy).
- `owner_responses` — append-only; one per `review_id` (UNIQUE); 10–500 chars (CHECK); INSERT requires `is_business_member(auth.uid(), business_id)`.
- `verified_rewards` — `used_at` flips from `NULL` once via UPDATE WITH CHECK; `prevent_used_at_overwrite` trigger blocks any further mutation of `used_at` and any change to other columns.
- `business_profile_membership` — admin-managed only; not publicly readable (closes staff-enumeration vector).

## V. Validation pipeline

```text
Client form ──► reviewFormSchema (UI)
    │
    ▼
createServerFn ──► reviewSchema.parse() (sanitises XSS, length-bounds)
    │
    ▼
Supabase insert as caller ──► RLS predicate ──► CHECK constraint ──► (optional) trigger
```

Each layer assumes the layer above is hostile. Removing any layer is a regression.

## VI. Frustration fallback

If two consecutive fix attempts fail on the same error: stop, switch to plan mode, summarise the last three errors, and propose a clean-slate refactor instead of a third patch.

## VII. Pre-flight checklist (before publish)

- [ ] Security scan passes or remaining items are documented in `@security-memory`.
- [ ] No new `any` types.
- [ ] No new RLS policies missing predicates.
- [ ] No service-role imports outside `*.server.ts`.
- [ ] `CHANGELOG.md` updated with the new behaviour.