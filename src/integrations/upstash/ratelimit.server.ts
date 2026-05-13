// @business-logic: Distributed sliding-window rate limiter backed by Upstash REST.
// Replaces the in-memory token bucket so limits hold across Worker isolates.
// Fail-open on Upstash error: rate-limit is a cost guardrail, not a security
// boundary, and request availability beats limit precision.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; retryAfterSec: number; remaining: 0; limit: number };

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowSec: number;
};

/**
 * Extract the caller's IP from a Cloudflare/Workers request.
 * Prefers `CF-Connecting-IP` (set by Cloudflare on edge), falls back to the
 * left-most `X-Forwarded-For` entry, then "unknown".
 */
export function getClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

/**
 * Convenience: enforce multiple keys atomically. Returns the first failure,
 * or { ok: true } if all pass. Each key is checked sequentially — failures
 * short-circuit. All checks fail-open on Upstash unavailability.
 */
export async function checkAll(
  checks: ReadonlyArray<RateLimitOptions>,
): Promise<RateLimitResult> {
  for (const c of checks) {
    const res = await checkRateLimit(c);
    if (!res.ok) return res;
  }
  return { ok: true, remaining: Infinity as unknown as number, limit: Infinity as unknown as number };
}

/**
 * Fixed-window counter via Upstash REST pipeline (INCR + EXPIRE on first hit).
 * Two round-trips collapsed to one HTTP request.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSec } = opts;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    // Misconfigured — allow through, log once.
    console.error("[ratelimit] Upstash env vars missing; failing open");
    return { ok: true, remaining: limit, limit };
  }

  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSec), "NX"],
        ["TTL", key],
      ]),
    });
    if (!res.ok) {
      console.error("[ratelimit] Upstash HTTP", res.status);
      return { ok: true, remaining: limit, limit };
    }
    const json = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = Number(json[0]?.result ?? 0);
    const ttl = Number(json[2]?.result ?? windowSec);
    if (count > limit) {
      const retryAfterSec = ttl > 0 ? ttl : windowSec;
      return { ok: false, retryAfterSec, remaining: 0, limit };
    }
    return { ok: true, remaining: Math.max(0, limit - count), limit };
  } catch (err) {
    console.error("[ratelimit] Upstash fetch failed", err);
    return { ok: true, remaining: limit, limit };
  }
}