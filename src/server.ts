import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { ensureRequestId, REQUEST_ID_HEADER } from "./lib/request-id";
import { captureServerException } from "./lib/sentry.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(requestId: string): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  requestId: string,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const captured = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(`[${requestId}]`, captured);
  captureServerException(captured, { requestId, tags: { source: "ssr-h3-swallow" } });
  return brandedErrorResponse(requestId);
}

// Long-cache hashed assets (Vite emits content-hashed names under /assets/).
function withAssetCacheHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url);
  const path = url.pathname;
  const isHashedAsset = path.startsWith("/assets/");
  const isStaticIcon = /^\/(?:icon-|apple-touch-icon|favicon|manifest)/.test(path);
  if (!isHashedAsset && !isStaticIcon) return response;
  if (response.status >= 400) return response;
  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    isHashedAsset
      ? "public, max-age=31536000, immutable"
      : "public, max-age=86400",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestId = ensureRequestId(request.headers);
    // Propagate so downstream handlers (server fns, /api routes) can read it
    const propagated = new Request(request, {
      headers: (() => {
        const h = new Headers(request.headers);
        h.set(REQUEST_ID_HEADER, requestId);
        return h;
      })(),
    });
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(propagated, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response, requestId);
      const headers = new Headers(normalized.headers);
      headers.set(REQUEST_ID_HEADER, requestId);
      const tagged = new Response(normalized.body, {
        status: normalized.status,
        statusText: normalized.statusText,
        headers,
      });
      return withAssetCacheHeaders(request, tagged);
    } catch (error) {
      console.error(`[${requestId}]`, error);
      captureServerException(error, {
        requestId,
        tags: { source: "fetch-top-level" },
        extra: { url: request.url, method: request.method },
      });
      return brandedErrorResponse(requestId);
    }
  },
};
