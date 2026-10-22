import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  isMcpPublicAddress,
  isMcpRedirectUri,
  matchesMcpRedirectUri,
  validateMcpMetadataUrl,
} from "../src/lib/mcp-clients.js";
import {
  decideMcpConsent,
  exchangeMcpToken,
  getMcpAuthorizationRequest,
  listMcpConnections,
  McpOAuthError,
  readMcpConsent,
  resolveMcpClient,
  revokeMcpConnection,
  verifyMcpAccessToken,
} from "../src/lib/mcp-oauth.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const resource = "https://fitness.example/mcp";
const redirectUri = "http://127.0.0.1:49152/callback";
const prefix = `oauth-${randomUUID()}`;
let clientId = "";
let otherClientId = "";
let userId = "";
let otherUserId = "";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function authorizeQuery(verifier: string) {
  return new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "safe-state",
    scope: "fitness:read fitness:write",
  });
}

async function pending() {
  const verifier = randomBytes(32).toString("base64url");
  const request = await getMcpAuthorizationRequest(
    authorizeQuery(verifier),
    resource,
  );
  await readMcpConsent(request.id, userId);
  return { requestId: request.id, verifier };
}

async function code() {
  const request = await pending();
  const { redirect } = await decideMcpConsent(
    request.requestId,
    userId,
    true,
    resource,
  );
  const callback = new URL(redirect);
  assert.equal(callback.searchParams.get("state"), "safe-state");
  assert.equal(callback.searchParams.get("iss"), "https://fitness.example");
  assert.equal(callback.searchParams.get("error"), null);
  const authorizationCode = callback.searchParams.get("code");
  assert.ok(authorizationCode);
  return { ...request, code: authorizationCode };
}

async function issue() {
  const authorization = await code();
  const response = await exchangeMcpToken(
    {
      resource,
      client_id: clientId,
      grant_type: "authorization_code",
      code: authorization.code,
      redirect_uri: redirectUri,
      code_verifier: authorization.verifier,
    },
    resource,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as Record<string, string>;
  assert.ok(body.access_token);
  assert.ok(body.refresh_token);
  return { ...body, authorization };
}

function refresh(refreshToken: string, extra: Record<string, string> = {}) {
  return exchangeMcpToken(
    {
      resource,
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...extra,
    },
    resource,
  );
}

function errorCode(response: { body: object }) {
  return (response.body as { error: string }).error;
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.mcpClient.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("CIMD and callback URL security boundaries", async () => {
  for (const url of [
    "client",
    "http://public.example/client.json",
    "https://public.example",
    "https://public.example/?query=value",
    "https://localhost/client.json",
    "https://a.localhost/client.json",
    "https://127.0.0.1/client.json",
    "https://2130706433/client.json",
    "https://[::1]/client.json",
    "https://[::ffff:127.0.0.1]/client.json",
    "https://user:password@public.example/client.json",
    "https://public.example/client.json#part",
    "https://public.example/client.json#",
  ]) {
    assert.throws(() => validateMcpMetadataUrl(url), McpOAuthError, url);
  }
  assert.equal(
    validateMcpMetadataUrl("https://public.example/client.json").hostname,
    "public.example",
  );
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:10.1.2.3",
    "not-an-ip",
  ])
    assert.equal(isMcpPublicAddress(address), false, address);
  assert.equal(isMcpPublicAddress("1.1.1.1"), true);
  assert.equal(isMcpPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isMcpRedirectUri("http://localhost/callback"), true);
  assert.equal(isMcpRedirectUri("http://sub.localhost/callback"), false);
  assert.equal(
    matchesMcpRedirectUri("http://localhost:2222/callback", [
      "http://localhost:1111/callback",
    ]),
    true,
  );
  assert.equal(
    matchesMcpRedirectUri("http://localhost:2222/elsewhere", [
      "http://localhost:1111/callback",
    ]),
    false,
  );
  assert.equal(isMcpRedirectUri("https://user@client.example/callback"), false);
  assert.equal(
    isMcpRedirectUri("https://client.example/callback#fragment"),
    false,
  );
  assert.equal(
    matchesMcpRedirectUri("http://127.0.0.1:2222/callback", [redirectUri]),
    true,
  );
  assert.equal(
    matchesMcpRedirectUri("http://127.0.0.1:2222/elsewhere", [redirectUri]),
    false,
  );
  assert.equal(
    matchesMcpRedirectUri("http://127.0.0.2:2222/callback", [redirectUri]),
    false,
  );
  assert.equal(
    matchesMcpRedirectUri("http://[::1]:2222/callback", [redirectUri]),
    false,
  );
  assert.equal(
    matchesMcpRedirectUri("http://127.0.0.1:2222/a/../callback", [redirectUri]),
    false,
  );
  assert.equal(
    matchesMcpRedirectUri("https://client.example:2222/callback", [
      "https://client.example/callback",
    ]),
    false,
  );
  await assert.rejects(
    resolveMcpClient(`${prefix}-unregistered`),
    McpOAuthError,
  );
});

test("maintained OAuth server: consent, PKCE, grants and token lifecycle", async (t) => {
  const client = await prisma.mcpClient.create({
    data: {
      id: `${prefix}-client`,
      name: "OAuth Test Client",
      preRegistered: true,
      redirectUris: JSON.stringify([redirectUri]),
    },
  });
  const otherClient = await prisma.mcpClient.create({
    data: {
      id: `${prefix}-other`,
      name: "Other Client",
      preRegistered: true,
      redirectUris: JSON.stringify([redirectUri]),
    },
  });
  const user = await prisma.user.create({
    data: {
      username: `${prefix}-user`,
      passwordHash: "$2b$12$not-used-for-authentication",
    },
  });
  const otherUser = await prisma.user.create({
    data: {
      username: `${prefix}-other`,
      passwordHash: "$2b$12$not-used-for-authentication",
    },
  });
  clientId = client.id;
  otherClientId = otherClient.id;
  userId = user.id;
  otherUserId = otherUser.id;
  assert.equal((await resolveMcpClient(clientId)).name, client.name);

  await t.test(
    "invalid requests cannot produce unvalidated callbacks",
    async () => {
      const original = authorizeQuery("v".repeat(43));
      for (const [key, value] of [
        ["resource", `${resource}/`],
        ["redirect_uri", "https://evil.example/callback"],
        ["response_type", "token"],
        ["code_challenge_method", "plain"],
        ["code_challenge", "x"],
        ["state", ""],
        ["state", "x".repeat(1025)],
        ["scope", "admin"],
      ]) {
        const query = new URLSearchParams(original);
        query.set(key, value);
        await assert.rejects(
          getMcpAuthorizationRequest(query, resource),
          McpOAuthError,
        );
      }
      const duplicate = new URLSearchParams(original);
      duplicate.append("resource", resource);
      await assert.rejects(
        getMcpAuthorizationRequest(duplicate, resource),
        McpOAuthError,
      );
      const defaultScope = new URLSearchParams(original);
      defaultScope.delete("scope");
      const request = await getMcpAuthorizationRequest(defaultScope, resource);
      assert.match(request.id, /^[A-Za-z0-9_-]{43}$/);
      assert.deepEqual((await readMcpConsent(request.id, userId)).scopes, [
        "fitness:read",
      ]);
    },
  );

  await t.test(
    "consent binds the first user and consumes requests once",
    async () => {
      const request = await pending();
      await assert.rejects(
        readMcpConsent(request.requestId, otherUserId),
        McpOAuthError,
      );
      await assert.rejects(
        decideMcpConsent(request.requestId, otherUserId, true, resource),
        McpOAuthError,
      );
      const count = await prisma.mcpGrant.count({ where: { userId } });
      const denied = new URL(
        (await decideMcpConsent(request.requestId, userId, false, resource))
          .redirect,
      );
      assert.equal(denied.searchParams.get("error"), "access_denied");
      assert.equal(denied.searchParams.get("state"), "safe-state");
      assert.equal(denied.searchParams.get("iss"), "https://fitness.example");
      assert.equal(denied.searchParams.get("error_description"), null);
      assert.equal(await prisma.mcpGrant.count({ where: { userId } }), count);
      await assert.rejects(
        decideMcpConsent(request.requestId, userId, true, resource),
        McpOAuthError,
      );
      const expired = await pending();
      await prisma.mcpAuthorizationRequest.update({
        where: { id: expired.requestId },
        data: { expiresAt: new Date(0) },
      });
      await assert.rejects(
        decideMcpConsent(expired.requestId, userId, true, resource),
        McpOAuthError,
      );
    },
  );

  await t.test(
    "bad PKCE consumes the code even when the library rejects",
    async () => {
      const authorization = await code();
      const body = {
        resource,
        client_id: clientId,
        grant_type: "authorization_code",
        code: authorization.code,
        redirect_uri: redirectUri,
        code_verifier: "x".repeat(43),
      };
      const failed = await exchangeMcpToken(body, resource);
      assert.equal(errorCode(failed), "invalid_grant");
      const stored = await prisma.mcpAuthorizationCode.findUniqueOrThrow({
        where: { tokenHash: digest(authorization.code) },
      });
      assert.ok(stored.usedAt);
      assert.equal(
        errorCode(
          await exchangeMcpToken(
            { ...body, code_verifier: authorization.verifier },
            resource,
          ),
        ),
        "invalid_grant",
      );
      assert.equal(
        await prisma.mcpToken.count({ where: { grantId: stored.grantId } }),
        0,
      );
    },
  );

  await t.test(
    "audience, client binding, code reuse and hashed persistence",
    async () => {
      const authorization = await code();
      const body = {
        resource,
        client_id: clientId,
        grant_type: "authorization_code",
        code: authorization.code,
        redirect_uri: redirectUri,
        code_verifier: authorization.verifier,
      };
      assert.equal(
        errorCode(
          await exchangeMcpToken(
            { ...body, resource: "https://other.example/mcp" },
            resource,
          ),
        ),
        "invalid_target",
      );
      assert.equal(
        errorCode(
          await exchangeMcpToken(
            { ...body, client_id: otherClientId },
            resource,
          ),
        ),
        "invalid_grant",
      );
      const success = await exchangeMcpToken(body, resource);
      assert.equal(success.status, 200, JSON.stringify(success.body));
      const token = success.body as Record<string, string>;
      assert.equal(
        errorCode(await exchangeMcpToken(body, resource)),
        "invalid_grant",
      );
      const principal = await verifyMcpAccessToken(
        token.access_token,
        resource,
      );
      assert.ok(principal);
      assert.equal(principal.userId, userId);
      assert.equal(principal.clientId, clientId);
      assert.ok(principal.expiresAt > Date.now() / 1000);
      assert.ok(principal.expiresAt <= Date.now() / 1000 + 15 * 60);
      assert.deepEqual(principal.scopes, ["fitness:read", "fitness:write"]);
      assert.equal(
        await verifyMcpAccessToken(
          token.access_token,
          "https://other.example/mcp",
        ),
        null,
      );
      const stored = await prisma.mcpToken.findUniqueOrThrow({
        where: { accessTokenHash: digest(token.access_token) },
      });
      assert.equal(stored.refreshTokenHash, digest(token.refresh_token));
      assert.ok(stored.accessExpiresAt.getTime() <= Date.now() + 15 * 60_000);
      assert.ok(
        stored.refreshExpiresAt.getTime() <= Date.now() + 30 * 24 * 3600_000,
      );
      assert.ok(!JSON.stringify(stored).includes(token.access_token));
      assert.equal(success.headers?.["Cache-Control"], "no-store");
    },
  );

  await t.test(
    "refresh rotates, narrows scope, and reuse revokes the family",
    async () => {
      const initial = await issue();
      assert.equal(
        errorCode(
          await refresh(initial.refresh_token, { client_id: otherClientId }),
        ),
        "invalid_grant",
      );
      assert.ok(await verifyMcpAccessToken(initial.access_token, resource));
      assert.equal(
        errorCode(await refresh(initial.refresh_token, { scope: "admin" })),
        "invalid_scope",
      );
      const next = await refresh(initial.refresh_token, {
        scope: "fitness:read",
      });
      assert.equal(next.status, 200, JSON.stringify(next.body));
      const token = next.body as Record<string, string>;
      assert.notEqual(token.refresh_token, initial.refresh_token);
      assert.deepEqual(
        (await verifyMcpAccessToken(token.access_token, resource))?.scopes,
        ["fitness:read"],
      );
      assert.equal(
        errorCode(
          await refresh(token.refresh_token, { scope: "fitness:write" }),
        ),
        "invalid_scope",
      );
      // A rotated row must survive cleanup even after its own refresh expiry.
      await prisma.mcpToken.update({
        where: { refreshTokenHash: digest(initial.refresh_token) },
        data: { refreshExpiresAt: new Date(0) },
      });
      await pending();
      assert.ok(
        await prisma.mcpToken.findUnique({
          where: { refreshTokenHash: digest(initial.refresh_token) },
        }),
      );
      assert.equal(
        errorCode(await refresh(initial.refresh_token)),
        "invalid_grant",
      );
      assert.equal(
        await verifyMcpAccessToken(initial.access_token, resource),
        null,
      );
      assert.equal(
        await verifyMcpAccessToken(token.access_token, resource),
        null,
      );
      assert.equal(
        errorCode(await refresh(token.refresh_token)),
        "invalid_grant",
      );
    },
  );

  await t.test(
    "concurrent refresh permits one rotation and detects reuse",
    async () => {
      const initial = await issue();
      const results = await Promise.all([
        refresh(initial.refresh_token),
        refresh(initial.refresh_token),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 400],
      );
      const success = results.find((result) => result.status === 200);
      assert.ok(success);
      assert.equal(
        await verifyMcpAccessToken(
          (success.body as Record<string, string>).access_token,
          resource,
        ),
        null,
      );
    },
  );

  await t.test(
    "grant expiration clamps rotation and revocation is owner-only",
    async () => {
      const initial = await issue();
      const principal = await verifyMcpAccessToken(
        initial.access_token,
        resource,
      );
      assert.ok(principal);
      const absoluteExpiry = new Date(Date.now() + 60_000);
      await prisma.mcpGrant.update({
        where: { id: principal.grantId },
        data: { expiresAt: absoluteExpiry },
      });
      const rotated = await refresh(initial.refresh_token);
      assert.equal(rotated.status, 200);
      const token = rotated.body as Record<string, string>;
      const stored = await prisma.mcpToken.findUniqueOrThrow({
        where: { refreshTokenHash: digest(token.refresh_token) },
      });
      assert.equal(stored.refreshExpiresAt.getTime(), absoluteExpiry.getTime());
      assert.equal(stored.accessExpiresAt.getTime(), absoluteExpiry.getTime());
      assert.ok(
        (await listMcpConnections(userId)).connections.some(
          (connection) => connection.id === principal.grantId,
        ),
      );
      assert.ok(
        !(await listMcpConnections(otherUserId)).connections.some(
          (connection) => connection.id === principal.grantId,
        ),
      );
      assert.deepEqual(
        await revokeMcpConnection(otherUserId, principal.grantId),
        { revoked: true },
      );
      assert.ok(await verifyMcpAccessToken(token.access_token, resource));
      await revokeMcpConnection(userId, principal.grantId);
      await revokeMcpConnection(userId, principal.grantId);
      assert.equal(
        await verifyMcpAccessToken(token.access_token, resource),
        null,
      );
      assert.equal(
        errorCode(await refresh(token.refresh_token)),
        "invalid_grant",
      );
      const expired = await issue();
      const expiredPrincipal = await verifyMcpAccessToken(
        expired.access_token,
        resource,
      );
      assert.ok(expiredPrincipal);
      await prisma.mcpGrant.update({
        where: { id: expiredPrincipal.grantId },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        await verifyMcpAccessToken(expired.access_token, resource),
        null,
      );
      assert.equal(
        errorCode(await refresh(expired.refresh_token)),
        "invalid_grant",
      );
    },
  );
});
