# ADR-001: No service worker (PWA install only)

- **Status:** Accepted, 2026-05-13
- **Context:** Audit reports repeatedly flag the absence of a service worker as "missing offline support."

## Decision

TasteLedger ships a PWA install manifest (`public/manifest.webmanifest`) and icons so users can "Add to Home Screen", but **does not register a service worker**.

## Why

1. **Lovable preview iframe.** Service workers attached to the preview origin intercept the editor iframe and cause stale-asset rendering during active development. The hit to authoring iteration is severe and immediate.
2. **Stale-shell hazard for installed devices.** A SW that caches the app shell can serve an outdated client that talks to an evolving RLS schema, producing silent breakage we cannot remotely revoke without bumping the SW version on every release.
3. **Limited offline value.** The ledger is read-mostly but security-sensitive: every read is RLS-scoped and tied to a live JWT. Cached pages without a session would mislead users; cached responses with a session would leak across account switches.
4. **No regulatory or product requirement** for offline-first behaviour at v1.

## Consequences

- The app is installable but requires connectivity to function — acceptable for a verified-review product whose value is freshness.
- The "offline cached ledger" line in the original product brief is **deferred**, not delivered.

## Re-evaluate when any of these change

- The app moves to a stable custom production domain separate from the preview origin (eliminates iframe collision).
- A native wrapper (Capacitor / Tauri) is introduced — handle offline at the wrapper layer, not via SW.
- Product requirement explicitly mandates offline read of redeemable rewards.
- Lovable preview gains a documented mechanism to scope SW registration away from the editor frame.

## Alternatives considered

- **Workbox network-first SW** — rejected on hazards #1 and #2 above.
- **Manual `Cache-Control` on `/api/summarize`** — already shipped (`private, max-age=60` + 5-min LRU); covers the cost-amplification concern without an SW.