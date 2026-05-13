// @business-logic: Minimal Sentry envelope poster for Cloudflare Workers.
// The official @sentry/node SDK is Node-only and crashes in Workers; the
// @sentry/cloudflare SDK requires a Wrangler-specific entry we don't expose.
// We implement just enough of the envelope protocol to ship `event` items
// (errors with stack + tags). Fire-and-forget; never throws.

const DSN = process.env.SENTRY_DSN;
const RELEASE = process.env.LOVABLE_RELEASE ?? "unknown";
const ENV = process.env.NODE_ENV ?? "production";

type Parsed = {
  endpoint: string;
  publicKey: string;
};

let parsed: Parsed | null | undefined;

function parseDsn(): Parsed | null {
  if (parsed !== undefined) return parsed;
  if (!DSN) return (parsed = null);
  try {
    const u = new URL(DSN);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId || !u.username) return (parsed = null);
    parsed = {
      endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
    return parsed;
  } catch {
    return (parsed = null);
  }
}

function scrubPII<T>(obj: T): T {
  // Strip obvious PII keys before shipping. Defence in depth — server
  // functions should not log raw user content anyway.
  const SENSITIVE = /^(email|password|content|code|token|authorization)$/i;
  if (Array.isArray(obj)) return obj.map(scrubPII) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[scrubbed]" : scrubPII(v);
    }
    return out as unknown as T;
  }
  return obj;
}

function frameFromLine(line: string): Record<string, unknown> | null {
  // "    at fnName (file:line:col)" or "    at file:line:col"
  const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
  if (!m) return null;
  return {
    function: m[1] ?? "<anonymous>",
    filename: m[2],
    lineno: Number(m[3]),
    colno: Number(m[4]),
    in_app: !/node_modules|@tanstack|cloudflare/.test(m[2]),
  };
}

export type CaptureContext = {
  requestId?: string;
  userId?: string;
  route?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function captureServerException(err: unknown, ctx: CaptureContext = {}): void {
  const cfg = parseDsn();
  if (!cfg) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const stack = (error.stack ?? "")
    .split("\n")
    .slice(1)
    .map(frameFromLine)
    .filter(Boolean) as Record<string, unknown>[];

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Date.now() / 1000;

  const event = {
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: "error",
    environment: ENV,
    release: RELEASE,
    server_name: "cloudflare-worker",
    tags: {
      runtime: "cloudflare-workers",
      ...(ctx.requestId ? { request_id: ctx.requestId } : {}),
      ...(ctx.route ? { route: ctx.route } : {}),
      ...(ctx.tags ?? {}),
    },
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: scrubPII(ctx.extra ?? {}),
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: { frames: stack.reverse() },
        },
      ],
    },
  };

  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: DSN }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  // Fire-and-forget
  fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${cfg.publicKey}, sentry_client=tasteledger-edge/1.0`,
    },
    body: envelope,
  }).catch(() => {
    /* swallow — never let observability take down the request */
  });
}