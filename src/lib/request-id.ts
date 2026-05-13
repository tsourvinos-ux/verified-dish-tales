// Tiny helper — single source of truth for the request-ID header name.
export const REQUEST_ID_HEADER = "X-Request-ID";

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function ensureRequestId(headers: Headers): string {
  const existing = headers.get(REQUEST_ID_HEADER);
  if (existing) return existing;
  return newRequestId();
}