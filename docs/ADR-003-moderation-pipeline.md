# ADR-003: Pre-write AI moderation + admin override

**Status:** Accepted (2026-05)

## Context

The ledger is append-only by design — `reviews` and `owner_responses` have no UPDATE/DELETE policies. This is great for integrity, terrible for handling abuse: a single slur stays in public view forever.

## Decision

Two-layer moderation:

1. **Pre-write AI screen** via Lovable AI Gateway (`google/gemini-2.5-flash-lite`) returning `{ allow, reason, severity }`. `high` rejects, `low` inserts with `is_visible=false`. AI failure → fail-open + auto-flag for admin.
2. **Admin override** at `/admin/moderation` — admin can flip `is_visible` only. Content + ratings stay immutable. Trigger `prevent_review_content_mutation()` enforces this at the database level.

## Consequences

- Adds ~500ms latency to writes — acceptable for a one-shot interaction.
- `moderation_flags` audit table grows monotonically; needs periodic archival eventually.
- The `is_visible` column is the **only** mutable flag on otherwise-immutable rows. The exception is documented and enforced by trigger.