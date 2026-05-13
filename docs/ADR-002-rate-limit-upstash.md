# ADR-002: Distributed rate limiting via Upstash Redis

**Status:** Accepted (2026-05) · **Supersedes:** in-memory token bucket noted in ADR-001 epilogue

## Context

The original rate limiter on `/api/summarize` was a per-Worker-isolate token bucket. Cloudflare spawns isolates per-region per-traffic-pattern, so the limit was per-isolate not per-user — easily bypassed and a poor cost guardrail for the Lovable AI Gateway.

## Decision

Use **Upstash Redis** (REST API, serverless billing) for distributed counters. Keys: `rl:summarize:<uid>`, `rl:summarize:ip:<ip>`, `rl:review:<uid>`, `rl:resp:biz:<bid>`. Single-pipeline `INCR` + `EXPIRE NX` + `TTL` per check. Fail-open on Upstash unavailability.

## Consequences

- One extra HTTP round-trip per protected request (~30-60ms from CF edge to nearest Upstash region).
- Ops surface area grows: Upstash dashboard becomes a thing to monitor.
- Free tier is sufficient (10k commands/day) at current scale.
- Bypassed: a sustained Upstash outage means we silently fall back to "no limit". Acceptable — the AI Gateway has its own per-key cap.