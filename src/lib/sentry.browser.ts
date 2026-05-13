import * as Sentry from "@sentry/react";

// Browser-side Sentry. DSN is exposed via a tiny endpoint OR injected at
// build time. We read from a global written by the server in shellComponent.
declare global {
  interface Window {
    __SENTRY_DSN__?: string;
    __REQUEST_ID__?: string;
  }
}

let initialised = false;

export function initSentryClient(): void {
  if (initialised) return;
  if (typeof window === "undefined") return;
  const dsn = window.__SENTRY_DSN__;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip review/response content if it ever ends up in breadcrumbs.
      if (event.request?.data && typeof event.request.data === "object") {
        const data = event.request.data as Record<string, unknown>;
        for (const k of ["content", "password", "code"]) {
          if (k in data) data[k] = "[scrubbed]";
        }
      }
      return event;
    },
    initialScope: {
      tags: { runtime: "browser" },
      ...(window.__REQUEST_ID__ ? { contexts: { request: { id: window.__REQUEST_ID__ } } } : {}),
    },
  });
  initialised = true;
}

export function captureClientException(err: unknown, extra?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(err, { extra });
}