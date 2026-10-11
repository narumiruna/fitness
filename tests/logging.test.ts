import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { safeError } from "../src/lib/logger";
import { requestLogFields } from "../src/lib/request-log-fields";

function run(source: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", source],
    {
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("Pino emits JSON and removes secrets from fields and errors", () => {
  const records = run(`
    import { logger } from "./src/lib/logger.ts";
    const err = Object.assign(new Error("secret-password secret-sql"), {
      code: "P2002", meta: { token: "secret-meta" }, cause: new Error("secret-cause"),
    });
    logger.info({
      event: "test.redaction",
      password: "secret-password", token: "secret-token",
      tokenHash: "secret-hash", headers: { cookie: "secret-cookie" },
      formData: { notes: "secret-notes" },
      user: { passwordHash: "secret-password-hash" },
      databaseUrl: "secret-database", err,
    }, "Safe diagnostic");
  `);
  const output = JSON.stringify(records);
  assert.equal(output.includes("secret-"), false);
  assert.equal(records[0].event, "test.redaction");
  assert.equal(records[0].password, "[REDACTED]");
  assert.equal(records[0].err.code, "P2002");
  assert.equal(records[0].err.type, "Error");
  assert.equal(typeof records[0].time, "string");
});

test("safe errors omit non-Error payloads and validation input", () => {
  assert.deepEqual(safeError({ password: "secret" }), { type: "UnknownError" });
  const err = new Error("secret");
  err.name = "ZodError";
  assert.equal(safeError(err).type, "ZodError");
  assert.equal(JSON.stringify(safeError(err)).includes("secret"), false);
});

test("async log context keeps concurrent request IDs separate", () => {
  const records = run(`
    import { logger, getLogger, withLogger } from "./src/lib/logger.ts";
    await Promise.all(["request-a", "request-b"].map(requestId =>
      withLogger(logger.child({ requestId }), async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        getLogger().info({ event: "test.context" }, "Context preserved");
      })
    ));
    getLogger().info({ event: "test.outside" }, "No request context");
  `);
  assert.deepEqual(
    records
      .slice(0, 2)
      .map((record) => record.requestId)
      .sort(),
    ["request-a", "request-b"],
  );
  assert.equal(records[2].requestId, undefined);
});

test("request diagnostics expose protocol and cookie presence, not cookie contents", () => {
  const fields = requestLogFields(
    new Headers({
      host: "fitness.example",
      "x-forwarded-proto": "https, http",
      origin: "http://fitness.example:8783/private?password=secret",
      cookie: "other=secret-other; fitness_session=secret-token",
      authorization: "Bearer secret-auth",
      "next-action": "secret-action-id",
    }),
  );
  assert.equal(fields.protocol, "https");
  assert.equal(fields.originProtocol, "http");
  assert.equal(fields.hasSessionCookie, true);
  assert.equal(fields.isServerAction, true);
  assert.equal(JSON.stringify(fields).includes("secret"), false);
  const missing = requestLogFields(
    new Headers({ origin: "invalid", "x-forwarded-proto": "invalid" }),
  );
  assert.equal(missing.protocol, "unknown");
  assert.equal(missing.originProtocol, "unknown");
  assert.equal(missing.hasSessionCookie, false);
});

test("proxy replaces caller request IDs and excludes query strings", () => {
  const records = run(`
    import { NextRequest } from "next/server.js";
    import { proxy } from "./src/proxy.ts";
    const request = new NextRequest("http://localhost:8783/login?password=secret-query", {
      headers: { "x-fitness-request-id": "spoofed", cookie: "fitness_session=secret-token" },
    });
    const response = proxy(request);
    const requestId = response.headers.get("x-request-id");
    if (!requestId || requestId === "spoofed") throw new Error("Invalid request ID");
    if (response.headers.get("x-middleware-request-x-fitness-request-id") !== requestId)
      throw new Error("Request ID not forwarded");
  `);
  assert.equal(records[0].event, "request.received");
  assert.equal(records[0].path, "/login");
  assert.equal(records[0].hasSessionCookie, true);
  assert.equal(JSON.stringify(records).includes("secret"), false);
});
