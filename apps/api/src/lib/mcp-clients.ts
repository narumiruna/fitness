import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import { prisma } from "./prisma.js";

export class McpOAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "McpOAuthError";
  }
}

function invalidClient(): never {
  throw new McpOAuthError(400, "invalid_client");
}

/** Reject special-use addresses, including IPv4-mapped IPv6 addresses. */
export function isMcpPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export function validateMcpMetadataUrl(clientId: string): URL {
  try {
    const url = new URL(clientId);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (
      clientId.length > 2048 ||
      url.protocol !== "https:" ||
      url.pathname === "/" ||
      url.username ||
      url.password ||
      url.hash ||
      clientId.includes("#") ||
      hostname.toLowerCase().replace(/\.$/, "").endsWith("localhost") ||
      (ipaddr.isValid(hostname) && !isMcpPublicAddress(hostname))
    )
      invalidClient();
    return url;
  } catch {
    return invalidClient();
  }
}

export function isMcpRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      !url.username &&
      !url.password &&
      !value.includes("#") &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          (url.hostname === "127.0.0.1" ||
            url.hostname === "[::1]" ||
            url.hostname === "localhost")))
    );
  } catch {
    return false;
  }
}

/** Only the port can vary for an RFC 8252 loopback callback. */
export function matchesMcpRedirectUri(
  value: string,
  registered: string[],
): boolean {
  if (!isMcpRedirectUri(value)) return false;
  return registered.some((candidate) => {
    if (!isMcpRedirectUri(candidate)) return false;
    if (candidate === value) return true;
    const actual = new URL(value);
    const expected = new URL(candidate);
    if (actual.protocol !== "http:" || expected.protocol !== "http:")
      return false;
    actual.port = "";
    expected.port = "";
    // Compare the original text except its port: do not normalize a different path.
    const withoutPort = (uri: string) =>
      uri.replace(
        /^(http:\/\/(?:127\.0\.0\.1|\[::1\]|localhost))(?::[0-9]+)?(?=\/|\?|$)/,
        "$1",
      );
    return (
      actual.hostname === expected.hostname &&
      withoutPort(value) === withoutPort(candidate)
    );
  });
}

const metadataSchema = z.object({
  client_id: z.string(),
  client_name: z.string().trim().min(1).max(200),
  redirect_uris: z.array(z.string().refine(isMcpRedirectUri)).min(1).max(20),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).min(1).default(["code"]),
});

async function fetchMetadata(url: URL): Promise<unknown> {
  const signal = AbortSignal.timeout(5000);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  // Resolve all records before choosing one. The HTTPS lookup is pinned to that
  // record, so a second DNS answer cannot replace the checked destination.
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("timeout")), {
        once: true,
      });
    }),
  ]);
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isMcpPublicAddress(address))
  )
    invalidClient();
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: pinned.family,
        signal,
        headers: { accept: "application/json" },
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, pinned.family),
      },
      (response) => {
        // Never follow redirects or fetch metadata display URLs.
        if (
          response.statusCode !== 200 ||
          !/^application\/(?:json|[\w.-]+\+json)(?:;|$)/i.test(
            response.headers["content-type"] ?? "",
          )
        ) {
          response.destroy();
          reject(new Error("metadata"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 32768) {
            response.destroy(new Error("size"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("metadata"));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function resolveMcpClient(clientId: string) {
  try {
    if (!clientId || clientId.length > 2048) invalidClient();
    const existing = await prisma.mcpClient.findUnique({
      where: { id: clientId },
    });
    if (existing?.preRegistered) return existing;
    const url = validateMcpMetadataUrl(clientId);
    if (
      existing?.metadataExpiresAt &&
      existing.metadataExpiresAt > new Date() &&
      existing.metadataExpiresAt.getTime() <= Date.now() + 3600_000
    )
      return existing;
    const metadata = metadataSchema.parse(await fetchMetadata(url));
    if (
      metadata.client_id !== clientId ||
      !metadata.grant_types.includes("authorization_code")
    )
      invalidClient();
    const data = {
      name: metadata.client_name,
      redirectUris: JSON.stringify(metadata.redirect_uris),
      metadataExpiresAt: new Date(Date.now() + 3600_000),
    };
    // Never overwrite an operator-managed registration in a concurrent fetch.
    if (existing) {
      await prisma.mcpClient.updateMany({
        where: { id: clientId, preRegistered: false },
        data,
      });
      return await prisma.mcpClient.findUniqueOrThrow({
        where: { id: clientId },
      });
    }
    return await prisma.mcpClient.upsert({
      where: { id: clientId },
      create: { id: clientId, ...data },
      update: {},
    });
  } catch {
    return invalidClient();
  }
}
