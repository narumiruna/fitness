import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@/lib/logger");
    logger.info(
      {
        event: "server.started",
        secureSessionCookie: process.env.NODE_ENV === "production",
      },
      "Server logging initialized",
    );
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/lib/logger");
  logger.error(
    {
      event: "request.failed",
      err,
      requestId: request.headers["x-fitness-request-id"],
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    },
    "Request failed",
  );
};
