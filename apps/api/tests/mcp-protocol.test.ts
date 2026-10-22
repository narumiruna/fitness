import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { setImmediate as nextTick } from "node:timers/promises";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { mcpToolSchemas } from "@narumitw/fitness-contracts";
import { Hono } from "hono";
import { z } from "zod";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { McpBodyError, readMcpBody } from "../src/mcp/body.js";
import { McpLimits } from "../src/mcp/limits.js";
import { mountMcpMachineRoutes } from "../src/mcp/routes.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const origin = "https://fitness.example";
const resource = `${origin}/mcp`;
const modern = "2026-07-28";
const legacy = "2025-11-25";
const prefix = `mcp-protocol-${randomUUID()}`;
const app = createApp({ trustedOrigin: origin });
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const clientInfo = { name: "fitness-protocol-test", version: "1.0.0" };
const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.object({ code: z.number().int(), message: z.string() }).optional(),
});
let userId: string;
let otherUserId: string;
let clientId: string;
let readToken: string;
let writeToken: string;
let otherToken: string;
let cookie: string;

function envelope(
  method: string,
  params: Record<string, unknown> = {},
  version = modern,
) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: version,
        [CLIENT_CAPABILITIES_META_KEY]: {},
        [CLIENT_INFO_META_KEY]: clientInfo,
      },
    },
  };
}

function headers(method: string, token = readToken, name?: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": modern,
    "mcp-method": method,
    ...(name ? { "mcp-name": name } : {}),
  };
}

function post(
  method: string,
  params: Record<string, unknown> = {},
  token = readToken,
  extra: Record<string, string> = {},
) {
  return app.request(resource, {
    method: "POST",
    headers: {
      ...headers(
        method,
        token,
        typeof params.name === "string" ? params.name : undefined,
      ),
      ...extra,
    },
    body: JSON.stringify(envelope(method, params)),
  });
}

async function rpc(response: Response) {
  assert.equal(response.headers.get("mcp-session-id"), null);
  const raw = await response.text();
  if (response.headers.get("content-type")?.startsWith("text/event-stream")) {
    // Legacy transports may send an empty priming event before the RPC result.
    const messages = raw.split(/\r?\n\r?\n/).flatMap((event) => {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
    const message = messages.find((item) => item.id === 1);
    assert.ok(message, "Legacy SSE must include the RPC response");
    return rpcSchema.parse(message);
  }
  return rpcSchema.parse(JSON.parse(raw));
}

async function success(response: Response) {
  assert.equal(response.status, 200);
  const body = await rpc(response);
  assert.equal(body.error, undefined);
  assert.ok(body.result);
  return body.result;
}

async function assertChallenge(
  response: Response,
  status: 401 | 403,
  scope = "fitness:read",
) {
  assert.equal(response.status, status);
  const challenge = response.headers.get("www-authenticate");
  assert.ok(challenge);
  assert.match(challenge, /^Bearer /);
  assert.ok(
    challenge.includes(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    ),
  );
  assert.ok(challenge.includes(`scope="${scope}"`));
  if (status === 403)
    assert.ok(challenge.includes('error="insufficient_scope"'));
  assert.equal(
    response.headers.get("cache-control")?.includes("no-store"),
    true,
  );
  assert.deepEqual(await response.json(), {
    error: status === 403 ? "insufficient_scope" : "invalid_token",
  });
}

async function seedToken(
  options: {
    userId?: string;
    resource?: string;
    scopes?: string;
    accessExpiresAt?: Date;
    grantExpiresAt?: Date;
    revokedAt?: Date;
  } = {},
) {
  const token = opaque();
  const scopes = options.scopes ?? "fitness:read";
  const grant = await prisma.mcpGrant.create({
    data: {
      userId: options.userId ?? userId,
      clientId,
      resource: options.resource ?? resource,
      scopes,
      expiresAt: options.grantExpiresAt ?? new Date(Date.now() + 3600_000),
      revokedAt: options.revokedAt,
      tokens: {
        create: {
          accessTokenHash: digest(token),
          refreshTokenHash: digest(opaque()),
          scopes,
          accessExpiresAt:
            options.accessExpiresAt ?? new Date(Date.now() + 900_000),
          refreshExpiresAt: new Date(Date.now() + 3600_000),
        },
      },
    },
  });
  return { token, grantId: grant.id };
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.mcpClient.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("MCP HTTP boundary and modern/legacy stateless protocol", async (t) => {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}-owner`,
      passwordHash: "$2b$12$not-used-for-authentication",
    },
  });
  const otherUser = await prisma.user.create({
    data: {
      username: `${prefix}-other`,
      passwordHash: "$2b$12$not-used-for-authentication",
    },
  });
  userId = user.id;
  otherUserId = otherUser.id;
  clientId = `${prefix}-client`;
  await prisma.mcpClient.create({
    data: {
      id: clientId,
      name: "Protocol test client",
      preRegistered: true,
      redirectUris: JSON.stringify(["http://127.0.0.1:49152/callback"]),
    },
  });
  readToken = (await seedToken()).token;
  writeToken = (await seedToken({ scopes: "fitness:write" })).token;
  otherToken = (await seedToken({ userId: otherUserId })).token;
  const session = opaque();
  await prisma.session.create({
    data: {
      userId: otherUserId,
      tokenHash: digest(session),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  cookie = `fitness_session=${session}`;

  await t.test(
    "public OAuth metadata and unauthenticated challenge use the configured resource",
    async () => {
      for (const path of [
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
      ]) {
        const response = await app.request(`${origin}${path}`, {
          headers: {
            "x-forwarded-host": "attacker.invalid",
            "x-forwarded-proto": "http",
            "sec-fetch-site": "cross-site",
          },
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          resource,
          resource_name: "Fitness",
          authorization_servers: [origin],
          scopes_supported: ["fitness:read"],
          bearer_methods_supported: ["header"],
        });
      }
      const metadata = await app.request(
        `${origin}/.well-known/oauth-authorization-server`,
      );
      assert.equal(metadata.status, 200);
      const body = await metadata.json();
      assert.equal(body.issuer, origin);
      assert.equal(body.token_endpoint, `${origin}/oauth/token`);
      assert.equal(body.client_id_metadata_document_supported, true);
      assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
      for (const method of ["POST", "GET", "DELETE"]) {
        await assertChallenge(
          await app.request(resource, {
            method,
            ...(method === "POST" ? { body: "{}" } : {}),
          }),
          401,
        );
      }
      await assertChallenge(
        await app.request(`${resource}?access_token=${opaque()}`, {
          method: "POST",
          body: "{}",
        }),
        401,
      );
    },
  );

  await t.test(
    "browser cookies are not bearer credentials and cannot change the principal",
    async () => {
      await assertChallenge(
        await app.request(resource, {
          method: "POST",
          headers: { cookie },
          body: "{}",
        }),
        401,
      );
      const result = await success(
        await post(
          "tools/call",
          { name: "fitness_get_context", arguments: {} },
          readToken,
          { cookie },
        ),
      );
      assert.equal(
        mcpToolSchemas.fitness_get_context.outputSchema.parse(
          result.structuredContent,
        ).displayName,
        user.username.slice(0, 64),
      );
      await assertChallenge(
        await post("tools/list", {}, opaque(), { cookie }),
        401,
      );
    },
  );

  await t.test(
    "invalid audience, access expiry, grant expiry and revocation all return 401",
    async () => {
      for (const options of [
        { resource: "https://other.example/mcp" },
        { accessExpiresAt: new Date(0) },
        { grantExpiresAt: new Date(0) },
        { revokedAt: new Date() },
      ]) {
        const invalid = await seedToken(options);
        await assertChallenge(await post("tools/list", {}, invalid.token), 401);
      }
      const revocable = await seedToken();
      await success(await post("tools/list", {}, revocable.token));
      await prisma.mcpGrant.update({
        where: { id: revocable.grantId },
        data: { revokedAt: new Date() },
      });
      await assertChallenge(await post("tools/list", {}, revocable.token), 401);
      await assertChallenge(
        await app.request(resource, {
          method: "POST",
          headers: { authorization: "Bearer malformed!" },
          body: "{}",
        }),
        401,
      );
    },
  );

  await t.test(
    "scopes are checked at HTTP boundary and cannot be upgraded by cookies",
    async () => {
      const before = await prisma.workout.count({ where: { userId } });
      await assertChallenge(
        await post(
          "tools/call",
          { name: "fitness_record_workout", arguments: {} },
          readToken,
          { cookie },
        ),
        403,
        "fitness:write",
      );
      await assertChallenge(
        await post(
          "tools/call",
          { name: "fitness_get_context", arguments: {} },
          writeToken,
        ),
        403,
      );
      assert.equal(await prisma.workout.count({ where: { userId } }), before);
      const response = await app.request(resource, {
        method: "POST",
        headers: { ...headers("tools/call"), "mcp-protocol-version": legacy },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "fitness_record_workout", arguments: {} },
        }),
      });
      await assertChallenge(response, 403, "fitness:write");
    },
  );

  await t.test(
    "browser mutation CSRF stays enforced on neighboring MCP paths",
    async () => {
      for (const path of [
        "/api/actions/setLocaleAction",
        "/api/mcp/connections/missing/revoke",
        "/api/mcp/authorization/missing",
        "/mcpfoo",
        "/mcp/",
      ]) {
        const response = await app.request(`${origin}${path}`, {
          method: "POST",
          headers: { ...headers("tools/list"), cookie },
          body: "{}",
        });
        assert.equal(response.status, 403, path);
        const error = await response.json();
        assert.equal(error.error.code, "FORBIDDEN");
      }
      const crossSite = await app.request(
        `${origin}/api/actions/setLocaleAction`,
        {
          method: "POST",
          headers: {
            origin,
            cookie,
            "content-type": "application/json",
            "sec-fetch-site": "cross-site",
          },
          body: JSON.stringify({ locale: "en" }),
        },
      );
      assert.equal(crossSite.status, 403);
    },
  );

  await t.test(
    "Host and supplied Origin are checked before protocol dispatch",
    async () => {
      const deniedHeaders: Record<string, string>[] = [
        { host: "attacker.invalid" },
        { host: "fitness.example.attacker.invalid" },
        { host: "fitness.example:444" },
        { host: "fitness.example@attacker.invalid" },
        { origin: "https://attacker.invalid" },
        { origin: `${origin}/` },
        { origin: "null" },
      ];
      for (const extra of deniedHeaders) {
        assert.equal(
          (await post("tools/list", {}, readToken, extra)).status,
          403,
        );
      }
      assert.equal(
        (
          await app.request(
            `${origin}/.well-known/oauth-protected-resource/mcp`,
            { headers: { host: "attacker.invalid" } },
          )
        ).status,
        403,
      );
      for (const method of ["GET", "DELETE"]) {
        assert.equal(
          (
            await app.request(resource, {
              method,
              headers: {
                authorization: `Bearer ${readToken}`,
                origin: "https://attacker.invalid",
              },
            })
          ).status,
          403,
        );
      }
      await success(
        await post("tools/list", {}, readToken, {
          origin,
          host: "fitness.example",
          "x-forwarded-host": "attacker.invalid",
        }),
      );
    },
  );

  await t.test(
    "body byte limits cover chunked and misleading Content-Length before JSON parsing",
    async () => {
      const size = 256 * 1024;
      for (const declared of [undefined, "1", String(size + 1)]) {
        let cancelled = false;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array(64 * 1024).fill(32));
          },
          cancel() {
            cancelled = true;
          },
        });
        const init: RequestInit & { duplex: "half" } = {
          method: "POST",
          headers: {
            ...headers("tools/list"),
            ...(declared ? { "content-length": declared } : {}),
          },
          body: stream,
          duplex: "half",
        };
        const response = await app.request(new Request(resource, init));
        assert.equal(response.status, 413);
        assert.deepEqual(await response.json(), { error: "invalid_request" });
        if (declared !== String(size + 1)) assert.equal(cancelled, true);
        await stream.cancel();
      }
      const invalidUtf8 = new Uint8Array([
        123, 34, 120, 34, 58, 34, 0xc3, 0x28, 34, 125,
      ]);
      const invalid = await app.request(resource, {
        method: "POST",
        headers: headers("tools/list"),
        body: invalidUtf8,
      });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: "invalid_request" });
      const malformed = await app.request(resource, {
        method: "POST",
        headers: headers("tools/list"),
        body: "{",
      });
      assert.equal(malformed.status, 400);
      assert.ok((await rpc(malformed)).error);
      const batch = await app.request(resource, {
        method: "POST",
        headers: headers("tools/list"),
        body: JSON.stringify([envelope("tools/list")]),
      });
      assert.equal(batch.status, 400);
      assert.equal((await rpc(batch)).error?.code, -32600);
    },
  );

  await t.test(
    "modern discovery, list and calls work without an initialization or session",
    async () => {
      const discovery = await success(await post("server/discover"));
      assert.ok(discovery.capabilities);
      const result = await success(await post("tools/list"));
      const tools = z
        .array(
          z.object({
            name: z.string(),
            inputSchema: z.record(z.string(), z.unknown()),
            outputSchema: z.record(z.string(), z.unknown()),
            annotations: z.object({
              readOnlyHint: z.boolean(),
              destructiveHint: z.boolean(),
              idempotentHint: z.boolean(),
              openWorldHint: z.boolean(),
            }),
          }),
        )
        .parse(result.tools);
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        Object.keys(mcpToolSchemas).sort(),
      );
      for (const tool of tools) {
        assert.equal(
          tool.annotations.readOnlyHint,
          tool.name !== "fitness_record_workout",
        );
        assert.equal(tool.annotations.destructiveHint, false);
        assert.equal(tool.annotations.idempotentHint, true);
        assert.equal(tool.annotations.openWorldHint, false);
      }
      const contexts = await Promise.all(
        [readToken, otherToken].map(async (token) => {
          const output = await success(
            await post(
              "tools/call",
              { name: "fitness_get_context", arguments: {} },
              token,
            ),
          );
          const structured =
            mcpToolSchemas.fitness_get_context.outputSchema.parse(
              output.structuredContent,
            );
          const content = z
            .array(z.object({ type: z.literal("text"), text: z.string() }))
            .parse(output.content);
          assert.deepEqual(JSON.parse(content[0].text), structured);
          assert.notEqual(output.isError, true);
          return structured;
        }),
      );
      assert.equal(contexts[0].displayName, user.username.slice(0, 64));
      assert.equal(contexts[1].displayName, otherUser.username.slice(0, 64));
      assert.notEqual(contexts[0].displayName, contexts[1].displayName);
      const unknown = await post("tools/call", {
        name: "run_sql",
        arguments: {},
      });
      assert.equal(unknown.status, 200);
      const failure = await rpc(unknown);
      assert.ok(failure.error || failure.result?.isError === true);
      const notFound = await success(
        await post("tools/call", {
          name: "fitness_get_workout",
          arguments: { workoutId: `${prefix}-absent` },
        }),
      );
      assert.equal(notFound.isError, true);
      const content = z
        .array(z.object({ text: z.string() }))
        .parse(notFound.content);
      assert.deepEqual(JSON.parse(content[0].text), {
        error: { code: "NOT_FOUND" },
      });
    },
  );

  await t.test(
    "modern metadata, method and name headers must agree with the body",
    async () => {
      const mismatches: Record<string, string>[] = [
        { "mcp-method": "tools/call" },
        { "mcp-protocol-version": legacy },
      ];
      for (const extra of mismatches) {
        const response = await post("tools/list", {}, readToken, extra);
        assert.equal(response.status, 400);
        assert.ok((await rpc(response)).error);
      }
      const mismatch = await post(
        "tools/call",
        { name: "fitness_get_context", arguments: {} },
        readToken,
        { "mcp-name": "fitness_get_workout" },
      );
      assert.equal(mismatch.status, 400);
      assert.ok((await rpc(mismatch)).error);
      for (const missing of [
        "mcp-protocol-version",
        "mcp-method",
        "mcp-name",
      ]) {
        const supplied = new Headers(
          headers("tools/call", readToken, "fitness_get_context"),
        );
        supplied.delete(missing);
        const response = await app.request(resource, {
          method: "POST",
          headers: supplied,
          body: JSON.stringify(
            envelope("tools/call", {
              name: "fitness_get_context",
              arguments: {},
            }),
          ),
        });
        assert.equal(response.status, 400, missing);
        assert.ok((await rpc(response)).error);
      }
      const noMeta = await app.request(resource, {
        method: "POST",
        headers: headers("tools/list"),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      assert.equal(noMeta.status, 400);
      assert.ok((await rpc(noMeta)).error);
      const unsupported = "2099-01-01";
      const response = await app.request(resource, {
        method: "POST",
        headers: {
          ...headers("tools/list"),
          "mcp-protocol-version": unsupported,
        },
        body: JSON.stringify(envelope("tools/list", {}, unsupported)),
      });
      assert.equal(response.status, 400);
      assert.ok((await rpc(response)).error);
    },
  );

  await t.test(
    "2025 initialize, tools/list and tools/call are independently stateless",
    async () => {
      const send = (method: string, params: Record<string, unknown> = {}) =>
        app.request(resource, {
          method: "POST",
          headers: {
            authorization: `Bearer ${readToken}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": legacy,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
      const initialized = await success(
        await send("initialize", {
          protocolVersion: legacy,
          capabilities: {},
          clientInfo,
        }),
      );
      assert.equal(initialized.protocolVersion, legacy);
      const listed = await success(await send("tools/list"));
      assert.equal(z.array(z.unknown()).parse(listed.tools).length, 7);
      const called = await success(
        await send("tools/call", {
          name: "fitness_get_context",
          arguments: {},
        }),
      );
      assert.equal(
        mcpToolSchemas.fitness_get_context.outputSchema.parse(
          called.structuredContent,
        ).displayName,
        user.username.slice(0, 64),
      );
      // A new independent list has no session identifier or initialization state.
      await success(await send("tools/list"));
    },
  );

  await t.test(
    "GET and DELETE refuse authenticated callers without creating sessions",
    async () => {
      for (const method of ["GET", "DELETE"]) {
        const response = await app.request(resource, {
          method,
          headers: {
            authorization: `Bearer ${readToken}`,
            "mcp-protocol-version": modern,
          },
        });
        assert.equal(response.status, 405);
        assert.equal(response.headers.get("allow"), "POST");
        assert.equal(response.headers.get("mcp-session-id"), null);
      }
    },
  );
});

test("MCP admission and deadline apply before a stalled bearer-token lookup", async (t) => {
  const isolated = new Hono();
  const stalled = Promise.withResolvers<null>();
  let lookups = 0;
  mountMcpMachineRoutes(isolated, origin, async () => {
    lookups++;
    return stalled.promise;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const start = () =>
    isolated.request(resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opaque()}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
  const waiting = Array.from({ length: 16 }, start);
  await nextTick();
  assert.equal(lookups, 16);
  assert.equal((await start()).status, 429);
  t.mock.timers.tick(15_000);
  for (const response of await Promise.all(waiting))
    assert.equal(response.status, 504);
  // Timed-out database work still occupies its slot until it actually settles.
  assert.equal((await start()).status, 429);
  stalled.resolve(null);
  await nextTick();
  assert.equal((await start()).status, 401);
});

test("MCP body deadlines cancel stalled uploads without waiting for the full request budget", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: stream,
    duplex: "half",
  };
  // The production timer is unrefed. Keep the test alive until its short deadline.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      readMcpBody(new Request(resource, init), 256 * 1024, Date.now() + 5),
      (error: unknown) => {
        assert.ok(error instanceof McpBodyError);
        assert.equal(error.status, 408);
        return true;
      },
    );
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("MCP limits enforce user/client concurrency, idempotent release and a bounded map", (t) => {
  let now = 100_000;
  t.mock.method(Date, "now", () => now);
  const limits = new McpLimits();
  const first = limits.acquire(["user:a", "client:a"], 3, 1);
  assert.ok(first);
  assert.equal(limits.acquire(["user:a", "client:b"], 3, 1), null);
  assert.equal(limits.acquire(["user:b", "client:a"], 3, 1), null);
  first();
  const second = limits.acquire(["user:a", "client:a"], 3, 1);
  assert.ok(second);
  first();
  assert.equal(
    limits.acquire(["user:a", "client:a"], 3, 1),
    null,
    "repeated release must not reduce a later active request",
  );
  second();
  const third = limits.acquire(["user:a", "client:a"], 3, 1);
  assert.ok(third);
  third();
  assert.equal(
    limits.acquire(["user:a", "client:a"], 3, 1),
    null,
    "release must not reset the rate counter",
  );
  now += 60_001;
  const renewed = limits.acquire(["user:a", "client:a"], 3, 1);
  assert.ok(renewed);
  now += 60_001;
  assert.equal(
    limits.acquire(["user:a", "client:a"], 3, 1),
    null,
    "window expiry must not remove active requests",
  );
  renewed();
  const afterRelease = limits.acquire(["user:a", "client:a"], 3, 1);
  assert.ok(afterRelease);
  afterRelease();
  const full = new McpLimits();
  for (let index = 0; index < 2000; index++) {
    const release = full.acquire([`user:${index}`], 5, 1);
    assert.ok(release);
    release();
  }
  assert.equal(full.acquire(["new-user"], 5, 1), null);
  const existing = full.acquire(["user:0"], 5, 1);
  assert.ok(existing);
  existing();
  now += 60_001;
  const reclaimed = full.acquire(["new-user"], 5, 1);
  assert.ok(reclaimed);
  reclaimed();
});
