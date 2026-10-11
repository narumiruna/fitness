import "server-only";

import { unstable_rethrow } from "next/navigation";
import { withLogger } from "@/lib/logger";
import { getRequestLogger } from "@/lib/request-logger";

export async function loggedAction<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<T> {
  const log = (await getRequestLogger()).child({ action });
  const start = performance.now();
  return withLogger(log, async () => {
    log.info({ event: "action.started" }, "Server action started");
    try {
      const result = await operation();
      log.info(
        {
          event: "action.completed",
          durationMs: Math.round(performance.now() - start),
        },
        "Server action completed",
      );
      return result;
    } catch (err) {
      // Redirects and other Next.js control flow are not application failures.
      try {
        unstable_rethrow(err);
      } catch (controlFlow) {
        log.info(
          {
            event: "action.control_flow",
            durationMs: Math.round(performance.now() - start),
          },
          "Server action ended with Next.js control flow",
        );
        throw controlFlow;
      }
      log.error(
        {
          event: "action.failed",
          err,
          durationMs: Math.round(performance.now() - start),
        },
        "Server action failed",
      );
      throw err;
    }
  });
}
