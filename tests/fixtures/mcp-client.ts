import { prisma } from "../../apps/api/src/lib/prisma.js";

/** Test-only registration. Never expose an unauthenticated registration API. */
export async function seedMcpClient() {
  const url = process.env.DATABASE_URL ?? "";
  if (
    !(
      /\/fitness-ui-[^/]+\/test\.db$/.test(url) ||
      /^postgresql:\/\/fitness:fitness@127\.0\.0\.1:\d+\/fitness$/.test(url)
    )
  )
    throw new Error("Disposable UI database required");
  try {
    await prisma.mcpClient.upsert({
      where: { id: "fitness-cli" },
      create: {
        id: "fitness-cli",
        name: "Fitness CLI test client",
        preRegistered: true,
        redirectUris: JSON.stringify(["http://127.0.0.1:8765/callback"]),
      },
      update: {},
    });
  } finally {
    await prisma.$disconnect();
  }
}
