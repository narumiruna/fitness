import { ActionRedirect } from "../errors.js";
import { getLogger, withLogger } from "./logger.js";
export async function loggedAction<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<T> {
  const log = getLogger().child({ action });
  const start = performance.now();
  return withLogger(log, async () => {
    log.info({ event: "action.started" }, "Action started");
    try {
      const result = await operation();
      log.info(
        {
          event: "action.completed",
          durationMs: Math.round(performance.now() - start),
        },
        "Action completed",
      );
      return result;
    } catch (err) {
      if (err instanceof ActionRedirect)
        log.info(
          { event: "action.redirect" },
          "Action completed with navigation",
        );
      else
        log.error(
          {
            event: "action.failed",
            err,
            durationMs: Math.round(performance.now() - start),
          },
          "Action failed",
        );
      throw err;
    }
  });
}
