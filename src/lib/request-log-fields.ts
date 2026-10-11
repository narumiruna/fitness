export function requestLogFields(headers: Headers) {
  const forwardedProtocol = headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "https" || forwardedProtocol === "http"
      ? forwardedProtocol
      : "unknown";
  let originProtocol = "unknown";
  try {
    const origin = headers.get("origin");
    if (origin) originProtocol = new URL(origin).protocol.replace(":", "");
  } catch {
    // Invalid origins are not logged.
  }
  return {
    host: headers.get("host")?.slice(0, 255),
    protocol,
    originProtocol,
    hasSessionCookie: /(?:^|;\s*)fitness_session=[^;]+/.test(
      headers.get("cookie") ?? "",
    ),
    isServerAction: headers.has("next-action"),
  };
}
