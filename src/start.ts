import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { captureServerException } from "./lib/sentry.server";
import { REQUEST_ID_HEADER } from "./lib/request-id";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    const requestId =
      typeof globalThis !== "undefined" && "Headers" in globalThis
        ? // best-effort: middleware doesn't expose request, fall back to a fresh id
          crypto.randomUUID()
        : "unknown";
    console.error(`[${requestId}]`, error);
    captureServerException(error, { requestId, tags: { source: "start-middleware" } });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
