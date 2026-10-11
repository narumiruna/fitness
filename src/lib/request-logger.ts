import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { cache } from "react";
import { logger } from "@/lib/logger";
import { requestLogFields } from "@/lib/request-log-fields";

export const getRequestLogger = cache(async () => {
  const requestHeaders = await headers();
  return logger.child({
    ...requestLogFields(requestHeaders),
    requestId: requestHeaders.get("x-fitness-request-id") ?? randomUUID(),
    method: requestHeaders.get("x-fitness-request-method") ?? "unknown",
    path: requestHeaders.get("x-fitness-request-path") ?? "unknown",
  });
});
