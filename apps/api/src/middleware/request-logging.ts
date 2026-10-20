import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { ActionRedirect } from "../errors.js";
import { logger, withLogger } from "../lib/logger.js";

export const requestLogging: MiddlewareHandler = async (c, next) => {
  const requestId = randomUUID();
  const url = new URL(c.req.url);
  let originProtocol: string | undefined;
  try {
    originProtocol = new URL(c.req.header("origin") ?? "").protocol.replace(
      ":",
      "",
    );
  } catch {
    /* No valid origin. */
  }
  const log = logger.child({
    requestId,
    method: c.req.method,
    pathname: url.pathname,
    protocol: url.protocol.replace(":", ""),
    originProtocol,
    hasSessionCookie: /(?:^|;\s*)fitness_session=/.test(
      c.req.header("cookie") ?? "",
    ),
  });
  c.header("x-request-id", requestId);
  const start = performance.now();
  return withLogger(log, async () => {
    log.info({ event: "request.received" }, "Request received");
    try {
      await next();
      if (c.error && !(c.error instanceof ActionRedirect))
        log.error({ event: "request.error", err: c.error }, "Request failed");
      log.info(
        {
          event: "request.completed",
          status: c.res.status,
          durationMs: Math.round(performance.now() - start),
        },
        "Request completed",
      );
    } catch (err) {
      log.error(
        {
          event: "request.error",
          err,
          durationMs: Math.round(performance.now() - start),
        },
        "Request failed",
      );
      throw err;
    }
  });
};
