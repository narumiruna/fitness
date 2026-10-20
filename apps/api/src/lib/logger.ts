import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";

// Error messages and causes can contain SQL values, credentials, or form data.
export function safeError(error: unknown) {
  if (!(error instanceof Error)) return { type: "UnknownError" };
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    type: error.name,
    code,
    stack: error.stack
      ?.split("\n")
      .filter((line) => /^\s+at /.test(line))
      .join("\n"),
  };
}

export const logger = pino({
  level: "info",
  base: {
    service: "fitness",
    environment: process.env.NODE_ENV ?? "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: { err: safeError },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "currentPassword",
      "newPassword",
      "confirmPassword",
      "token",
      "tokenHash",
      "cookie",
      "authorization",
      "*.password",
      "*.passwordHash",
      "*.currentPassword",
      "*.newPassword",
      "*.confirmPassword",
      "*.token",
      "*.tokenHash",
      "*.cookie",
      "*.authorization",
      "headers",
      "formData",
      "params",
      "query",
      "databaseUrl",
    ],
    censor: "[REDACTED]",
  },
});

const context = new AsyncLocalStorage<Logger>();

export function getLogger() {
  return context.getStore() ?? logger;
}

export function withLogger<T>(log: Logger, operation: () => T): T {
  return context.run(log, operation);
}
