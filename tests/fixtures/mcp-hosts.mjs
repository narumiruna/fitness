import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import { HostProcess } from "./mcp-host-process.mjs";

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === "--native-cimd"),
  "Unsupported native host test mode",
);
const nativeCimd = args[0] === "--native-cimd";
const piClientDocument = "https://pi.dev/oauth/client.json";
const scratch = process.env.FITNESS_MCP_CLIENTS_DIR;
assert.ok(scratch && /fitness-mcp-clients-[^/]+$/.test(scratch));
assert.equal(process.env.DATABASE_URL, `file:${join(scratch, "test.db")}`);
assert.equal(process.env.HOME, scratch);
const { logger } = await import("../../apps/api/src/lib/logger.ts");
logger.level = "silent";
const { createApp } = await import("../../apps/api/src/app.ts");
const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const run = promisify(execFile);
const hash = (value) => createHash("sha256").update(value).digest("hex");
let app;
const observed = [];
const server = serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/mcp" && request.method === "POST") {
      const body = await request
        .clone()
        .json()
        .catch(() => ({}));
      observed.push({
        method: body.method,
        protocol:
          request.headers.get("mcp-protocol-version") ??
          body.params?.protocolVersion,
      });
    }
    const response = await app.fetch(request);
    if (url.pathname === "/mcp" || url.pathname === "/oauth/token")
      observed.push({ path: url.pathname, status: response.status });
    return response;
  },
});
if (!server.listening) await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
const resource = `${origin}/mcp`;
app = createApp({ trustedOrigin: origin });
const range = { fromDate: "2026-10-01", toDateExclusive: "2026-11-01" };
const active = new Set();
let metadataGets = 0;
let metadataExpiry;
const originalFetch = globalThis.fetch;
const originalRequest = https.request;
const originalGet = https.get;
if (nativeCimd) {
  // Keep native discovery, tokens, cookies, and tool data on loopback. Do not
  // follow redirects that could bypass this check. CIMD uses node:https below.
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.protocol, "http:", "External native fetch blocked");
    assert.ok(
      url.origin === origin ||
        (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
          url.port &&
          url.pathname === "/callback"),
      "Only Fitness and native loopback callbacks are permitted",
    );
    assert.ok(!url.username && !url.password);
    return originalFetch(input, { ...init, redirect: "manual" });
  };
  // Observe the real Fitness resolver; do not replace its response, DNS checks,
  // TLS validation, or cache. This is the only permitted external HTTP request.
  https.request = (url, options, listener) => {
    assert.equal(url.href, piClientDocument, "Unknown CIMD request blocked");
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, { accept: "application/json" });
    for (const key of ["auth", "host", "hostname", "path", "port"])
      assert.equal(options[key], undefined);
    assert.equal(++metadataGets, 1, "CIMD metadata must be cached");
    const request = originalRequest(url, options, listener);
    const end = request.end;
    request.write = () => {
      throw new Error("External request bodies are forbidden");
    };
    request.end = function (...args) {
      assert.equal(args.length, 0, "External request bodies are forbidden");
      return end.call(this);
    };
    return request;
  };
  https.get = () => {
    throw new Error("External GET must use the guarded metadata resolver");
  };
  syncBuiltinESMExports();
}
async function availablePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function browser(path, cookie, body) {
  const response = await fetch(new URL(path, origin), {
    headers: { cookie, origin, "content-type": "application/json" },
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    response.status,
    200,
    `Browser fixture failed: ${path.split("/").slice(0, 4).join("/")}`,
  );
  return response.json();
}
async function approve(authUrl, cookie, record) {
  const url = new URL(authUrl);
  assert.equal(url.origin, origin, "No external OAuth endpoint permitted");
  assert.equal(url.pathname, "/oauth/authorize");
  if (nativeCimd) {
    assert.equal(url.searchParams.get("client_id"), piClientDocument);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.equal(url.searchParams.get("resource"), resource);
  }
  const redirect = new URL(url.searchParams.get("redirect_uri"));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(redirect.hostname));
  record.clientIds ??= [];
  record.clientIds.push(url.searchParams.get("client_id"));
  record.redirectUris ??= [];
  record.redirectUris.push(redirect.href);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 302, "Host authorization request rejected");
  if (nativeCimd) {
    const client = await prisma.mcpClient.findUniqueOrThrow({
      where: { id: piClientDocument },
    });
    assert.equal(client.preRegistered, false);
    assert.ok(client.metadataExpiresAt > new Date());
    metadataExpiry ??= client.metadataExpiresAt.getTime();
    assert.equal(client.metadataExpiresAt.getTime(), metadataExpiry);
    assert.equal(metadataGets, 1);
    assert.equal(redirect.protocol, "http:");
    assert.equal(redirect.hostname, "127.0.0.1");
    assert.equal(redirect.pathname, "/callback");
    assert.ok(redirect.port);
  }
  const consent = new URL(response.headers.get("location"), origin);
  const id = consent.searchParams.get("request");
  assert.ok(id);
  const pending = await browser(`/api/mcp/authorization/${id}`, cookie);
  record.consentedScopes ??= [];
  record.consentedScopes.push(pending.scopes);
  return (
    await browser(`/api/mcp/authorization/${id}`, cookie, { approved: true })
  ).redirect;
}
async function callback(url) {
  const parsed = new URL(url);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname));
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  assert.ok(
    response.status >= 200 && response.status < 400,
    "Loopback callback failed",
  );
}
async function user(name) {
  const account = await prisma.user.create({
    data: {
      username: name,
      passwordHash:
        "$2b$10$7EqJtq98hPqEX7fNZaFWoO5uJQHTPIQXQWPEW9naM9yOcZKWRwW3G",
    },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: account.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return { id: account.id, cookie: `fitness_session=${token}` };
}
async function register(id, redirects) {
  await prisma.mcpClient.create({
    data: {
      id,
      name: `Disposable ${id}`,
      preRegistered: true,
      redirectUris: JSON.stringify(redirects),
    },
  });
}
function result(value) {
  assert.equal(value.isError, undefined, "Native host returned a tool error");
  const structured = value.structuredContent ?? value.result?.structuredContent;
  if (structured) return structured;
  const content = value.content ?? value.result?.content;
  assert.ok(content, "Missing native tool result");
  return JSON.parse(content.find((item) => item.type === "text").text);
}
async function denied(call) {
  let rejected = false;
  let value;
  try {
    value = await call();
  } catch {
    rejected = true;
  }
  assert.ok(
    rejected || value?.isError === true,
    "Native host must reject or return an MCP error",
  );
}
async function workflow(host, account, record, exerciseId) {
  await host.login(["fitness:read"]);
  const context = result(await host.call("fitness_get_context", {}));
  assert.deepEqual(context.scopes, ["fitness:read"]);
  const tools = await host.tools();
  assert.equal(tools.length, 7);
  const write = tools.find((tool) => tool.name === "fitness_record_workout");
  assert.ok(write, "The native host must expose the write tool");
  record.writeReadOnlyHint = write.annotations?.readOnlyHint ?? null;
  const candidates = result(
    await host.call("fitness_search_exercises", {
      query: "Compatibility press",
      locale: "en",
    }),
  );
  assert.ok(
    candidates.exercises.some((exercise) => exercise.id === exerciseId),
  );
  const input = {
    operationId: randomUUID(),
    date: "2026-10-22",
    title: "Disposable compatibility workout",
    sets: [{ exerciseId, weightKg: 40, reps: 5, type: "WORKING" }],
  };
  const denialStart = observed.length;
  await denied(() => host.call("fitness_record_workout", input));
  assert.ok(
    observed
      .slice(denialStart)
      .some((item) => item.path === "/mcp" && item.status === 403),
    "Write denial must come from the Fitness scope boundary",
  );
  assert.equal(
    await prisma.workout.count({ where: { userId: account.id } }),
    0,
  );
  record.readOnlyWriteDenied = true;
  await host.login(["fitness:read", "fitness:write"]);
  const created = result(await host.call("fitness_record_workout", input));
  assert.equal(created.savedSetCount, 1);
  assert.equal(
    result(await host.call("fitness_record_workout", input)).retry,
    true,
  );
  const read = result(
    await host.call("fitness_get_workout", { workoutId: created.workoutId }),
  );
  assert.equal(read.sets[0].weightKg, 40);
  const summary = result(
    await host.call("fitness_get_training_summary", range),
  );
  assert.equal(summary.workoutCount, 1);
  assert.equal(summary.totalVolumeKgReps, 200);
  const listed = result(await host.call("fitness_list_workouts", range));
  assert.equal(listed.workouts.length, 1);
  assert.equal(listed.workouts[0].workoutId, created.workoutId);
  const progress = result(
    await host.call("fitness_get_exercise_progress", { ...range, exerciseId }),
  );
  assert.equal(progress.maxWeight.workoutId, created.workoutId);
  record.toolCount = tools.length;
  record.record = record.read = record.analyze = record.retry = true;
  const refreshStart = observed.length;
  const grants = await prisma.mcpGrant.findMany({
    where: { userId: account.id, revokedAt: null },
  });
  await prisma.mcpToken.updateMany({
    where: { grantId: { in: grants.map((grant) => grant.id) } },
    data: { accessExpiresAt: new Date(0) },
  });
  assert.ok(
    result(await host.call("fitness_get_context", {})).scopes.includes(
      "fitness:write",
    ),
  );
  assert.ok(
    observed
      .slice(refreshStart)
      .some((item) => item.path === "/mcp" && item.status === 401),
  );
  assert.ok(
    observed
      .slice(refreshStart)
      .some((item) => item.path === "/oauth/token" && item.status === 200),
  );
  record.refreshAfter401 = true;
  const connections = await browser("/api/mcp/connections", account.cookie);
  for (const connection of connections.connections)
    await browser(
      `/api/mcp/connections/${connection.id}/revoke`,
      account.cookie,
      {},
    );
  const revokeStart = observed.length;
  await denied(() => host.call("fitness_get_context", {}));
  assert.ok(
    observed
      .slice(revokeStart)
      .some((item) => item.path === "/mcp" && item.status === 401),
    "Revocation denial must come from the Fitness token boundary",
  );
  record.revokedCallDenied = true;
  record.coreWorkflow = "passed";
  if (nativeCimd) {
    assert.deepEqual(record.clientIds, [piClientDocument, piClientDocument]);
    assert.deepEqual(record.consentedScopes, [
      ["fitness:read"],
      ["fitness:read", "fitness:write"],
    ]);
    assert.equal(metadataGets, 1);
    assert.equal(await prisma.mcpClient.count(), 1);
    record.externalMetadataGets = metadataGets;
    record.metadataCacheReused = true;
    record.concurrentRefresh =
      "not run in --native-cimd; required separately by the unchanged general client gate";
    return;
  }
  // A separate grant keeps concurrency failures from hiding the core workflow.
  await host.login(["fitness:read", "fitness:write"]);
  await prisma.mcpToken.updateMany({
    where: { grant: { userId: account.id, revokedAt: null } },
    data: { accessExpiresAt: new Date(0) },
  });
  const traceStart = observed.length;
  const before = await prisma.mcpToken.count({
    where: { grant: { userId: account.id } },
  });
  const contexts = await Promise.allSettled([
    host.call("fitness_get_context", {}),
    host.call("fitness_get_context", {}),
  ]);
  record.concurrentRefreshRotations =
    (await prisma.mcpToken.count({
      where: { grant: { userId: account.id } },
    })) - before;
  record.concurrentRefreshCallsSucceeded = contexts.filter(
    (value) => value.status === "fulfilled" && !value.value?.isError,
  ).length;
  record.concurrentRefreshFamilyRevoked = Boolean(
    (
      await prisma.mcpGrant.findFirst({
        where: { userId: account.id },
        orderBy: { createdAt: "desc" },
      })
    )?.revokedAt,
  );
  record.concurrentRefreshTokenStatuses = observed
    .slice(traceStart)
    .filter((item) => item.path === "/oauth/token")
    .map((item) => item.status);
  assert.equal(
    record.concurrentRefreshCallsSucceeded,
    2,
    "Native client lost authorization during concurrent refresh",
  );
  for (const value of contexts)
    assert.ok(result(value.value).scopes.includes("fitness:write"));
  assert.equal(record.concurrentRefreshFamilyRevoked, false);
}

async function piHost(account, record) {
  const base = pathToFileURL(`${process.env.FITNESS_MCP_PI_ROOT}/`).href;
  const runtime = await import(new URL("dist/extensions/mcp/runtime.js", base));
  const auth = await import(new URL("dist/extensions/mcp/oauth.js", base));
  const storage = await import(new URL("dist/core/auth-storage.js", base));
  const credentials = new auth.McpOAuthCredentialStore(
    new storage.InMemoryAuthStorageBackend(),
  );
  const settings = nativeCimd
    ? { clientRegistration: "cimd", scope: "fitness:read" }
    : { clientId: "fitness-pi-test", scope: "fitness:read" };
  record.runtime = "built-in McpServerConnection and signInMcpServer";
  if (nativeCimd) {
    assert.equal(settings.clientId, undefined);
    record.configuredOAuth = { clientRegistration: "cimd", clientId: null };
  }
  const entry = {
    name: "fitness",
    source: "disposable",
    scope: "extension",
    config: { url: resource, oauth: settings, timeout: 10 },
  };
  const connection = new runtime.McpServerConnection({
    entry,
    cwd: scratch,
    credentials,
    createTransport: runtime.createDefaultTransport,
    onTools: () => {},
  });
  return {
    login: async (scopes) => {
      settings.scope = scopes.join(" ");
      // Do not let an existing read token skip explicit scope-upgrade consent.
      credentials.remove("fitness", resource);
      let approved;
      await runtime.signInMcpServer({
        serverUrl: resource,
        store: credentials.forServer("fitness", resource),
        settings,
        signal: AbortSignal.timeout(15_000),
        prompt: {
          showAuthorizationUrl: (url) => {
            approved = approve(url, account.cookie, record).then(callback);
          },
          promptForRedirectUrl: async (signal) => {
            await once(signal, "abort").catch(() => {});
            return undefined;
          },
        },
      });
      await approved;
      await connection.reconnect();
    },
    tools: async () => (await connection.getClient()).listTools(),
    call: (name, args) =>
      connection.callTool(name, args, { timeoutMs: 10_000 }),
    close: () => connection.close(),
  };
}
async function codexHost(account, record, env, modern = false) {
  record.runtime = modern
    ? "native app-server; --enable mcp_2026_07_28"
    : "native app-server; default legacy runtime";
  const clientId = modern
    ? "fitness-codex-modern-test"
    : "fitness-codex-default-test";
  const home = join(env.CODEX_HOME, modern ? "modern" : "default");
  await mkdir(home, { recursive: true });
  env = { ...env, CODEX_HOME: home };
  await writeFile(
    join(home, "config.toml"),
    `mcp_oauth_credentials_store = "file"\ncli_auth_credentials_store = "file"\ncheck_for_update_on_startup = false\n[analytics]\nenabled = false\n[mcp_servers.fitness]\nurl = ${JSON.stringify(resource)}\n[mcp_servers.fitness.oauth]\nclient_id = ${JSON.stringify(clientId)}\ncallback_url = "http://127.0.0.1/callback"\n`,
  );
  const process = new HostProcess(
    env.FITNESS_MCP_CODEX,
    [
      ...(modern ? ["--enable", "mcp_2026_07_28"] : []),
      "app-server",
      "--stdio",
    ],
    "codex",
    env,
  );
  active.add(process);
  await process.request("initialize", {
    clientInfo: { name: "fitness-compatibility", version: "1" },
    capabilities: { experimentalApi: true },
  });
  process.send({ jsonrpc: "2.0", method: "initialized" });
  let threadId;
  const start = async () => {
    const response = await process.request("thread/start", {
      cwd: scratch,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
    });
    threadId = response.thread.id;
  };
  await start();
  return {
    login: async (scopes) => {
      const authorization = await process.request("mcpServer/oauth/login", {
        name: "fitness",
        scopes,
        timeoutSecs: 15,
      });
      await callback(
        await approve(authorization.authorizationUrl, account.cookie, record),
      );
      await process.request("config/mcpServer/reload");
      await start();
    },
    tools: async () => {
      const status = await process.request("mcpServerStatus/list", {
        threadId,
        serverName: "fitness",
      });
      return Object.values(
        status.data.find((server) => server.name === "fitness").tools,
      );
    },
    call: (tool, args) =>
      process.request("mcpServer/tool/call", {
        threadId,
        server: "fitness",
        tool,
        arguments: args,
      }),
    close: () => process.close(),
  };
}
async function claudeHost(account, record, env) {
  const config = join(scratch, "claude-mcp.json");
  const callbackPort = await availablePort();
  const clientId = `fitness-claude-${env.MCP_SDK_GENERATION}-test`;
  await writeFile(
    config,
    JSON.stringify({
      mcpServers: {
        fitness: {
          type: "http",
          url: resource,
          oauth: { clientId, callbackPort },
        },
      },
    }),
  );
  const process = new HostProcess(
    env.FITNESS_MCP_CLAUDE,
    [
      "--print",
      "--verbose",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--no-session-persistence",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      config,
      "--tools",
      "",
      "--permission-mode",
      "dontAsk",
    ],
    "claude",
    env,
  );
  active.add(process);
  const init = await process.request("initialize", {});
  record.runtime = `native ${env.MCP_SDK_GENERATION}; stream-json control API; result_not_for_model; scratch plaintext OAuth store with OS keychain blocked`;
  assert.ok(
    init.capabilities?.mcp_call_result_not_for_model_v1 ||
      init.capabilities?.includes?.("mcp_call_result_not_for_model_v1"),
    "Claude must support no-model result routing",
  );
  return {
    login: async (scopes) => {
      // The native machine API has no scopes argument. Configure explicit scopes
      // in a fresh server definition, then authenticate without opening a browser.
      await process.request("mcp_clear_auth", { serverName: "fitness" });
      await process.request("mcp_set_servers", {
        servers: {
          fitness: {
            type: "http",
            url: resource,
            oauth: {
              clientId,
              callbackPort,
              scopes: scopes.join(" "),
            },
          },
        },
      });
      const authorization = await process.request("mcp_authenticate", {
        serverName: "fitness",
      });
      const redirected = await approve(
        authorization.authUrl,
        account.cookie,
        record,
      );
      await callback(redirected);
      for (let attempt = 0; attempt < 100; attempt++) {
        const status = (await process.request("mcp_status")).mcpServers.find(
          (server) => server.name === "fitness",
        );
        if (status?.status === "connected") return;
        await delay(50);
      }
      throw new Error(
        "Claude did not reconnect after its loopback OAuth callback",
      );
    },
    tools: async () =>
      (await process.request("mcp_status")).mcpServers.find(
        (server) => server.name === "fitness",
      ).tools,
    call: async (tool, args) =>
      process.request("mcp_call", {
        tool: `mcp__fitness__${tool}`,
        arguments: args,
        result_not_for_model: true,
      }),
    close: () => process.close(),
  };
}

try {
  if (nativeCimd) {
    assert.equal(await prisma.mcpClient.count(), 0, "No preloaded CIMD client");
  } else {
    await register("fitness-pi-test", ["http://127.0.0.1/callback"]);
    await register("fitness-codex-default-test", ["http://127.0.0.1/callback"]);
    await register("fitness-codex-modern-test", ["http://127.0.0.1/callback"]);
    await register("fitness-claude-v1-test", ["http://localhost/callback"]);
    await register("fitness-claude-v2-test", ["http://localhost/callback"]);
  }
  const exercise = await prisma.exercise.create({
    data: { slug: "mcp-client-test", defaultName: "Compatibility press" },
  });
  const hosts = [
    [
      "Pi",
      piHost,
      process.execPath,
      [
        join(process.env.FITNESS_MCP_PI_ROOT, "dist/bundle/cli.js"),
        "--version",
      ],
    ],
    ["Codex default", codexHost, process.env.FITNESS_MCP_CODEX, ["--version"]],
    [
      "Codex modern",
      (account, record, env) => codexHost(account, record, env, true),
      process.env.FITNESS_MCP_CODEX,
      ["--version"],
    ],
    [
      "Claude Code v2",
      (account, record, env) =>
        claudeHost(account, record, { ...env, MCP_SDK_GENERATION: "v2" }),
      process.env.FITNESS_MCP_CLAUDE,
      ["--version"],
    ],
    [
      "Claude Code v1",
      (account, record, env) =>
        claudeHost(account, record, { ...env, MCP_SDK_GENERATION: "v1" }),
      process.env.FITNESS_MCP_CLAUDE,
      ["--version"],
    ],
  ];
  for (const [name, create, command, args] of hosts) {
    if (nativeCimd && name !== "Pi") continue;
    const record = {
      host: name,
      version: (
        await run(command, args, {
          env: process.env,
          cwd: scratch,
          timeout: 10_000,
        })
      ).stdout.trim(),
      registration: nativeCimd
        ? "native CIMD OAuth; live public Pi document; no clientId or pre-registration"
        : "pre-registered public test client; no external CIMD fetch",
      modelCalls: 0,
      approval: "native machine API, not agent permission UI",
    };
    const account = await user(
      `mcp-${name.replaceAll(" ", "-").toLowerCase()}`,
    );
    const start = observed.length;
    let host;
    try {
      host = await create(account, record, process.env);
      await workflow(host, account, record, exercise.id);
      record.status = "passed";
    } catch (error) {
      record.status = "failed";
      record.failure = error.message;
      console.error(`${name}: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await host?.close();
      for (const child of active) await child.close();
      active.clear();
      record.protocols = [
        ...new Set(
          observed
            .slice(start)
            .map((item) => item.protocol)
            .filter(Boolean),
        ),
      ];
      console.log(JSON.stringify(record));
    }
  }
} finally {
  for (const child of active) await child.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  globalThis.fetch = originalFetch;
  https.request = originalRequest;
  https.get = originalGet;
  syncBuiltinESMExports();
}
