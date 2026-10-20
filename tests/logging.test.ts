import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { safeError } from "../apps/api/src/lib/logger";

function run(source: string) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", source],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

const middlewareImports = `
  import assert from "node:assert/strict";
  import { Hono } from "hono";
  import { requestLogging } from "./apps/api/src/middleware/request-logging.ts";
  import { getLogger } from "./apps/api/src/lib/logger.ts";
  const app = new Hono();
  app.use("*", requestLogging);
`;

test("Pino emits JSON and removes secrets from fields and errors", () => {
  const records = run(`
    import { logger } from "./apps/api/src/lib/logger.ts";
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
    import { logger, getLogger, withLogger } from "./apps/api/src/lib/logger.ts";
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

test("Hono replaces caller request IDs, preserves async context, and excludes request secrets", () => {
  const records = run(`${middlewareImports}
    app.get("/request/:key", async c => {
      await new Promise(resolve => setTimeout(resolve, 5));
      getLogger().info({ event: "test.http", key: c.req.param("key") }, "Context preserved");
      return c.json({ ok: true });
    });
    const responses = await Promise.all(["a", "b"].map(key =>
      app.request("http://localhost/request/" + key + "?password=secret-query", {
        headers: {
          "x-request-id": "spoofed", "x-fitness-request-id": "spoofed",
          "x-forwarded-proto": "https, http",
          origin: "http://localhost:8784/private?password=secret-origin",
          cookie: "other=secret-other; fitness_session=secret-token",
          authorization: "Bearer secret-auth",
        },
      })
    ));
    const ids = responses.map(response => response.headers.get("x-request-id"));
    assert.ok(ids.every(id => /^[0-9a-f-]{36}$/.test(id) && id !== "spoofed"));
    assert.equal(new Set(ids).size, 2);
    assert.ok(responses.every(response => response.status === 200));
    getLogger().info({ event: "test.outside" }, "No request context");
  `);
  for (const key of ["a", "b"]) {
    const operation = records.find((record) => record.key === key);
    assert.ok(operation?.requestId);
    const request = records.filter(
      (record) => record.requestId === operation.requestId,
    );
    assert.deepEqual(
      request.map((record) => record.event),
      ["request.received", "test.http", "request.completed"],
    );
    assert.equal(request[0].pathname, `/request/${key}`);
    assert.equal(request[0].hasSessionCookie, true);
    // Forwarded headers are diagnostic input, not a trusted transport source.
    assert.equal(request[0].protocol, "http");
    assert.equal(request[0].originProtocol, "http");
    assert.equal(request[2].status, 200);
    assert.equal(typeof request[2].durationMs, "number");
  }
  assert.equal(records.at(-1).requestId, undefined);
  assert.equal(JSON.stringify(records).includes("secret-"), false);
  assert.equal(JSON.stringify(records).includes("spoofed"), false);
});

test("Hono logs sanitized failures with the same request ID and final status", () => {
  const records = run(`${middlewareImports}
    app.onError((error, c) => c.json({ error: "internalError" }, 500));
    app.get("/failure", () => {
      throw Object.assign(new Error("secret-database secret-password"), { code: "P2002" });
    });
    const response = await app.request("http://localhost/failure?token=secret-query", {
      headers: { origin: "invalid", "x-forwarded-proto": "invalid" },
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internalError" });
    assert.ok(response.headers.get("x-request-id"));
  `);
  assert.deepEqual(
    records.map((record) => record.event),
    ["request.received", "request.error", "request.completed"],
  );
  assert.equal(new Set(records.map((record) => record.requestId)).size, 1);
  assert.equal(records[0].hasSessionCookie, false);
  assert.equal(records[0].protocol, "http");
  assert.equal(records[0].originProtocol, undefined);
  assert.equal(records[1].err.type, "Error");
  assert.equal(records[1].err.code, "P2002");
  assert.equal(records[2].status, 500);
  assert.equal(JSON.stringify(records).includes("secret-"), false);
});
