import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requestLogFields } from "@/lib/request-log-fields";

export function proxy(request: NextRequest) {
  const requestId = randomUUID();
  const requestHeaders = new Headers(request.headers);
  // Replace caller-supplied correlation metadata.
  requestHeaders.set("x-fitness-request-id", requestId);
  requestHeaders.set("x-fitness-request-method", request.method);
  requestHeaders.set("x-fitness-request-path", request.nextUrl.pathname);
  logger.info(
    {
      event: "request.received",
      requestId,
      method: request.method,
      path: request.nextUrl.pathname,
      ...requestLogFields(request.headers),
    },
    "Request received",
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
