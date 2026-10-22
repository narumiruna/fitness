import { createHash, randomBytes } from "node:crypto";
import OAuthServer from "@node-oauth/oauth2-server";
import type { McpClient, McpGrant } from "../generated/prisma/client.js";
import {
  McpOAuthError,
  matchesMcpRedirectUri,
  resolveMcpClient,
} from "./mcp-clients.js";
import { prisma } from "./prisma.js";

export { McpOAuthError, resolveMcpClient } from "./mcp-clients.js";

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const ACCESS_MS = 15 * 60_000;
const GRANT_MS = 30 * 24 * 3600_000;
const REQUEST_MS = 5 * 60_000;
const allowedScopes = new Set(["fitness:read", "fitness:write"]);
const opaque = () => randomBytes(32).toString("base64url");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const scopesOf = (value: string) => value.split(" ").filter(Boolean);
const validGrant = (grant: McpGrant, resource: string) =>
  !grant.revokedAt &&
  grant.expiresAt.getTime() > Date.now() &&
  grant.resource === resource;

function fail(code = "invalid_request", status = 400): never {
  throw new McpOAuthError(status, code);
}

async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof McpOAuthError) throw error;
    return fail("server_error", 500);
  }
}

function parseScopes(value: string | null): string[] {
  if (value === null) return ["fitness:read"];
  const scopes = value.split(" ");
  if (!scopes.length || scopes.some((scope) => !allowedScopes.has(scope)))
    fail("invalid_scope");
  return [...new Set(scopes)];
}

function oauthClient(client: McpClient): OAuthServer.Client {
  const uris: unknown = JSON.parse(client.redirectUris);
  if (!Array.isArray(uris) || uris.some((uri) => typeof uri !== "string"))
    fail("invalid_client");
  return {
    id: client.id,
    redirectUris: uris,
    grants: ["authorization_code", "refresh_token"],
  };
}

// Delete at most 100 rows of each kind per validated authorization request.
// Retain rotated refresh rows until absolute grant expiry to detect replay.
async function cleanupExpiredOAuthRows() {
  const now = new Date();
  const requests = await prisma.mcpAuthorizationRequest.findMany({
    where: { expiresAt: { lte: now } },
    take: 100,
    select: { id: true },
  });
  if (requests.length)
    await prisma.mcpAuthorizationRequest.deleteMany({
      where: { id: { in: requests.map((row) => row.id) } },
    });
  const codes = await prisma.mcpAuthorizationCode.findMany({
    where: { expiresAt: { lte: now } },
    take: 100,
    select: { tokenHash: true },
  });
  if (codes.length)
    await prisma.mcpAuthorizationCode.deleteMany({
      where: { tokenHash: { in: codes.map((row) => row.tokenHash) } },
    });
  const tokens = await prisma.mcpToken.findMany({
    where: { grant: { expiresAt: { lte: now } } },
    take: 100,
    select: { id: true },
  });
  if (tokens.length)
    await prisma.mcpToken.deleteMany({
      where: { id: { in: tokens.map((row) => row.id) } },
    });
}

export async function getMcpAuthorizationRequest(
  query: URLSearchParams,
  resource: string,
) {
  return safe(async () => {
    const seen = new Set<string>();
    for (const [key] of query) {
      if (seen.has(key)) fail();
      seen.add(key);
    }
    if (query.get("resource") !== resource) fail("invalid_target");
    if (query.get("response_type") !== "code")
      fail("unsupported_response_type");
    if (
      query.get("code_challenge_method") !== "S256" ||
      !/^[A-Za-z0-9_-]{43}$/.test(query.get("code_challenge") ?? "")
    )
      fail();
    const state = query.get("state");
    if (!state || state.length > 1024 || !/^[\x20-\x7e]+$/.test(state)) fail();
    const scopes = parseScopes(query.get("scope"));
    const client = await resolveMcpClient(query.get("client_id") ?? "");
    const redirectUri = query.get("redirect_uri") ?? "";
    if (
      !matchesMcpRedirectUri(
        redirectUri,
        oauthClient(client).redirectUris as string[],
      )
    )
      fail();
    await cleanupExpiredOAuthRows();
    const pending = await prisma.mcpAuthorizationRequest.create({
      data: {
        id: opaque(),
        clientId: client.id,
        redirectUri,
        resource,
        scopes: scopes.join(" "),
        state,
        codeChallenge: query.get("code_challenge") as string,
        expiresAt: new Date(Date.now() + REQUEST_MS),
      },
      select: { id: true },
    });
    return pending;
  });
}

export async function readMcpConsent(requestId: string, userId: string) {
  return safe(async () => {
    // A conditional write binds the first reader without a read/write race.
    await prisma.mcpAuthorizationRequest.updateMany({
      where: {
        id: requestId,
        userId: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { userId },
    });
    const request = await prisma.mcpAuthorizationRequest.findFirst({
      where: {
        id: requestId,
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { client: true },
    });
    if (!request) fail("invalid_request");
    return {
      requestId: request.id,
      clientId: request.clientId,
      clientName: request.client.name,
      scopes: scopesOf(request.scopes),
      resource: request.resource,
      expiresAt: request.expiresAt.toISOString(),
    };
  });
}

function createServer(
  tx: Transaction,
  storedClient: McpClient,
  resource: string,
) {
  const client = oauthClient(storedClient);
  const model: OAuthServer.AuthorizationCodeModel &
    OAuthServer.RefreshTokenModel = {
    getClient: async (id, secret) =>
      id === client.id && !secret ? client : false,
    getAccessToken: async () => false,
    generateAuthorizationCode: async () => opaque(),
    generateAccessToken: async () => opaque(),
    generateRefreshToken: async () => opaque(),
    validateRedirectUri: async (uri) =>
      matchesMcpRedirectUri(uri, client.redirectUris as string[]),
    validateScope: async (_user, _client, scopes) =>
      scopes?.length && scopes.every((scope) => allowedScopes.has(scope))
        ? scopes
        : false,
    saveAuthorizationCode: async (code, _client, user) => {
      if (
        typeof user.id !== "string" ||
        code.codeChallengeMethod !== "S256" ||
        !code.codeChallenge
      )
        throw new OAuthServer.InvalidGrantError("invalid_grant");
      const grant = await tx.mcpGrant.create({
        data: {
          userId: user.id,
          clientId: client.id,
          resource,
          scopes: (code.scope ?? []).join(" "),
          expiresAt: new Date(Date.now() + GRANT_MS),
        },
      });
      await tx.mcpAuthorizationCode.create({
        data: {
          tokenHash: hash(code.authorizationCode),
          grantId: grant.id,
          redirectUri: code.redirectUri,
          codeChallenge: code.codeChallenge,
          expiresAt: code.expiresAt,
        },
      });
      return { ...code, client, user: { id: user.id, grantId: grant.id } };
    },
    getAuthorizationCode: async (raw) => {
      const code = await tx.mcpAuthorizationCode.findUnique({
        where: { tokenHash: hash(raw) },
        include: { grant: true },
      });
      if (
        !code ||
        code.usedAt ||
        code.expiresAt.getTime() <= Date.now() ||
        code.grant.clientId !== client.id ||
        !validGrant(code.grant, resource)
      )
        return false;
      return {
        authorizationCode: raw,
        expiresAt: code.expiresAt,
        redirectUri: code.redirectUri,
        scope: scopesOf(code.grant.scopes),
        codeChallenge: code.codeChallenge,
        codeChallengeMethod: "S256",
        client,
        user: { id: code.grant.userId, grantId: code.grantId },
      };
    },
    revokeAuthorizationCode: async (code) =>
      (
        await tx.mcpAuthorizationCode.updateMany({
          where: { tokenHash: hash(code.authorizationCode), usedAt: null },
          data: { usedAt: new Date() },
        })
      ).count === 1,
    getRefreshToken: async (raw) => {
      const token = await tx.mcpToken.findUnique({
        where: { refreshTokenHash: hash(raw) },
        include: { grant: true },
      });
      // Check binding before reuse: a different client cannot revoke a family.
      if (
        !token ||
        token.grant.clientId !== client.id ||
        !validGrant(token.grant, resource)
      )
        return false;
      if (token.refreshUsedAt) {
        await tx.mcpGrant.update({
          where: { id: token.grantId },
          data: { revokedAt: new Date() },
        });
        return false;
      }
      if (token.refreshExpiresAt.getTime() <= Date.now()) return false;
      return {
        refreshToken: raw,
        refreshTokenExpiresAt: token.refreshExpiresAt,
        scope: scopesOf(token.scopes),
        client,
        user: { id: token.grant.userId, grantId: token.grantId },
      };
    },
    revokeToken: async (token) =>
      (
        await tx.mcpToken.updateMany({
          where: {
            refreshTokenHash: hash(token.refreshToken),
            refreshUsedAt: null,
          },
          data: { refreshUsedAt: new Date() },
        })
      ).count === 1,
    saveToken: async (token, _client, user) => {
      if (typeof user.grantId !== "string" || typeof user.id !== "string")
        throw new OAuthServer.InvalidGrantError("invalid_grant");
      const grant = await tx.mcpGrant.findUnique({
        where: { id: user.grantId },
      });
      if (
        !grant ||
        grant.userId !== user.id ||
        grant.clientId !== client.id ||
        !validGrant(grant, resource) ||
        typeof token.accessToken !== "string" ||
        typeof token.refreshToken !== "string" ||
        !Array.isArray(token.scope) ||
        !token.scope.length ||
        token.scope.some(
          (scope: unknown) =>
            typeof scope !== "string" ||
            !scopesOf(grant.scopes).includes(scope),
        )
      )
        throw new OAuthServer.InvalidGrantError("invalid_grant");
      const accessTokenExpiresAt = new Date(
        Math.min(
          Date.now() + ACCESS_MS,
          grant.expiresAt.getTime(),
          token.accessTokenExpiresAt?.getTime() ?? Infinity,
        ),
      );
      const refreshTokenExpiresAt = new Date(
        Math.min(
          grant.expiresAt.getTime(),
          token.refreshTokenExpiresAt?.getTime() ?? Infinity,
        ),
      );
      await tx.mcpToken.create({
        data: {
          grantId: grant.id,
          accessTokenHash: hash(token.accessToken),
          refreshTokenHash: hash(token.refreshToken),
          accessExpiresAt: accessTokenExpiresAt,
          refreshExpiresAt: refreshTokenExpiresAt,
          scopes: token.scope.join(" "),
        },
      });
      return {
        ...token,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        client,
        user,
      };
    },
  };
  return new OAuthServer({
    model,
    requirePKCE: true,
    authorizationCodeLifetime: REQUEST_MS / 1000,
    accessTokenLifetime: ACCESS_MS / 1000,
    refreshTokenLifetime: GRANT_MS / 1000,
    requireClientAuthentication: {
      authorization_code: false,
      refresh_token: false,
    },
    alwaysIssueNewRefreshToken: true,
  });
}

export async function decideMcpConsent(
  requestId: string,
  userId: string,
  approved: boolean,
  resource: string,
) {
  return safe(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { updatedAt: new Date() },
        });
        const pending = await tx.mcpAuthorizationRequest.findFirst({
          where: {
            id: requestId,
            userId,
            resource,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { client: true },
        });
        if (!pending) fail();
        const consumed = await tx.mcpAuthorizationRequest.updateMany({
          where: {
            id: requestId,
            userId,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) fail();
        const server = createServer(tx, pending.client, resource);
        const response = new OAuthServer.Response();
        const query = {
          client_id: pending.clientId,
          redirect_uri: pending.redirectUri,
          response_type: "code",
          scope: pending.scopes,
          state: pending.state,
          code_challenge: pending.codeChallenge,
          code_challenge_method: "S256",
          allowed: approved ? "true" : "false",
        };
        try {
          await server.authorize(
            new OAuthServer.Request({ method: "GET", headers: {}, query }),
            response,
            { authenticateHandler: { handle: async () => ({ id: userId }) } },
          );
        } catch (error) {
          if (approved || !(error instanceof OAuthServer.AccessDeniedError))
            fail("server_error", 500);
          const redirect = new URL(pending.redirectUri);
          redirect.searchParams.set("error", "access_denied");
          redirect.searchParams.set("state", pending.state);
          redirect.searchParams.set("iss", new URL(resource).origin);
          return { redirect: redirect.href };
        }
        const redirect = new URL(response.get("location"));
        redirect.searchParams.set("iss", new URL(resource).origin);
        return { redirect: redirect.href };
      },
      { timeout: 10_000 },
    ),
  );
}

type TokenResult = {
  status: number;
  body: object;
  headers?: Record<string, string>;
};
const tokenHeaders = { "Cache-Control": "no-store", Pragma: "no-cache" };
function tokenFailure(error: unknown): TokenResult {
  const safeCodes = new Set([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "invalid_scope",
    "invalid_target",
    "unsupported_grant_type",
    "unauthorized_client",
  ]);
  const code =
    error instanceof McpOAuthError
      ? error.code
      : error instanceof OAuthServer.OAuthError
        ? error.name
        : "server_error";
  return {
    status: safeCodes.has(code) ? 400 : 500,
    body: { error: safeCodes.has(code) ? code : "server_error" },
    headers: tokenHeaders,
  };
}

export async function exchangeMcpToken(
  body: Record<string, string>,
  resource: string,
): Promise<TokenResult> {
  try {
    if (body.resource !== resource) fail("invalid_target");
    if (
      body.grant_type !== "authorization_code" &&
      body.grant_type !== "refresh_token"
    )
      fail("unsupported_grant_type");
    if (Object.hasOwn(body, "client_secret")) fail("invalid_client");
    const client = await resolveMcpClient(body.client_id ?? "");
    const raw =
      body.grant_type === "authorization_code" ? body.code : body.refresh_token;
    if (!raw || raw.length > 1024) fail("invalid_grant");
    // Resolve only the owner outside the transaction. Re-read and validate all
    // authorization state after the database row lock. No network runs inside it.
    const binding =
      body.grant_type === "authorization_code"
        ? await prisma.mcpAuthorizationCode.findUnique({
            where: { tokenHash: hash(raw) },
            select: { grant: { select: { userId: true } } },
          })
        : await prisma.mcpToken.findUnique({
            where: { refreshTokenHash: hash(raw) },
            select: { grant: { select: { userId: true } } },
          });
    if (!binding) fail("invalid_grant");
    return await prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: binding.grant.userId },
          data: { updatedAt: new Date() },
        });
        const server = createServer(tx, client, resource);
        const response = new OAuthServer.Response();
        try {
          await server.token(
            new OAuthServer.Request({
              method: "POST",
              query: {},
              headers: {
                "content-type": "application/x-www-form-urlencoded",
                "content-length": String(
                  Buffer.byteLength(new URLSearchParams(body).toString()),
                ),
              },
              body,
            }),
            response,
          );
          return {
            status: response.status ?? 200,
            body: response.body as object,
            headers: tokenHeaders,
          };
        } catch (error) {
          // Keep this catch INSIDE the transaction: bad PKCE consumes the code,
          // and refresh reuse revokes its family even though the request fails.
          return tokenFailure(error);
        }
      },
      { timeout: 10_000 },
    );
  } catch (error) {
    return tokenFailure(error);
  }
}

export async function verifyMcpAccessToken(token: string, resource: string) {
  if (!token || token.length > 1024) return null;
  try {
    const stored = await prisma.mcpToken.findUnique({
      where: { accessTokenHash: hash(token) },
      include: { grant: true },
    });
    if (
      !stored ||
      stored.accessExpiresAt.getTime() <= Date.now() ||
      !validGrant(stored.grant, resource)
    )
      return null;
    return {
      userId: stored.grant.userId,
      clientId: stored.grant.clientId,
      scopes: scopesOf(stored.scopes),
      grantId: stored.grantId,
      expiresAt: Math.floor(
        Math.min(
          stored.accessExpiresAt.getTime(),
          stored.grant.expiresAt.getTime(),
        ) / 1000,
      ),
    };
  } catch {
    return null;
  }
}

export async function listMcpConnections(userId: string) {
  return safe(async () => {
    const grants = await prisma.mcpGrant.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      connections: grants.map((grant) => ({
        id: grant.id,
        clientId: grant.clientId,
        clientName: grant.client.name,
        scopes: scopesOf(grant.scopes),
        createdAt: grant.createdAt.toISOString(),
        expiresAt: grant.expiresAt.toISOString(),
      })),
    };
  });
}

export async function revokeMcpConnection(userId: string, id: string) {
  return safe(async () => {
    await prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { updatedAt: new Date() },
        });
        await tx.mcpGrant.updateMany({
          where: { id, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { timeout: 10_000 },
    );
    return { revoked: true as const };
  });
}
