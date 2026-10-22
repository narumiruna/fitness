import assert from "node:assert/strict";
import { join } from "node:path";

const scratch = process.env.FITNESS_MCP_CLIENTS_DIR;
assert.ok(scratch && /fitness-mcp-clients-[^/]+$/.test(scratch));
assert.equal(process.env.DATABASE_URL, `file:${join(scratch, "test.db")}`);
const { logger } = await import("../../apps/api/src/lib/logger.ts");
logger.level = "silent";
const { prisma } = await import("../../apps/api/src/lib/prisma.ts");
const { resolveMcpClient } = await import(
  "../../apps/api/src/lib/mcp-clients.ts"
);
const clientId = "https://pi.dev/oauth/client.json";
try {
  // This is the production metadata resolver, not a stubbed HTTP response.
  // It sends only a public HTTPS GET with an Accept header, without credentials.
  const client = await resolveMcpClient(clientId);
  assert.equal(client.id, clientId);
  assert.equal(client.preRegistered, false);
  assert.ok(client.metadataExpiresAt > new Date());
  const cached = await resolveMcpClient(clientId);
  assert.equal(
    cached.metadataExpiresAt.getTime(),
    client.metadataExpiresAt.getTime(),
  );
  console.log(
    JSON.stringify({
      clientId,
      status: "passed",
      registration: "live public CIMD resolution",
      redirects: JSON.parse(client.redirectUris),
      cached: true,
      limitation:
        "Public document resolution only; native OAuth workflows use offline pre-registration fixtures",
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      clientId,
      status: "failed",
      code: error.code ?? "CIMD_PROBE_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
