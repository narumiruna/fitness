import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "../apps/api/src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use a disposable database runner");
after(() => prisma.$disconnect());

test("MCP additive schema preserves legacy records, constraints, tombstones, and account cascades", async () => {
  const legacy = await prisma.workoutSet.findUniqueOrThrow({
    where: { id: "legacy-set" },
  });
  assert.equal(legacy.weight, 42.5);
  assert.equal(legacy.reps, 7);
  const user = await prisma.user.create({
    data: { username: `mcp-migration-${randomUUID()}`, passwordHash: "unused" },
  });
  const client = await prisma.mcpClient.create({
    data: {
      id: `migration-${randomUUID()}`,
      name: "Migration",
      redirectUris: "[]",
      preRegistered: true,
    },
  });
  try {
    const workout = await prisma.workout.create({
      data: { userId: user.id, date: new Date("2026-10-20T00:00:00") },
    });
    const receiptData = {
      userId: user.id,
      clientId: client.id,
      toolName: "fitness_record_workout",
      operationId: randomUUID(),
      payloadHash: createHash("sha256").update("fixture").digest("hex"),
      workoutId: workout.id,
    };
    const receipt = await prisma.mcpWriteReceipt.create({ data: receiptData });
    await assert.rejects(prisma.mcpWriteReceipt.create({ data: receiptData }));
    await prisma.workout.delete({ where: { id: workout.id } });
    assert.equal(
      (
        await prisma.mcpWriteReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
        })
      ).workoutId,
      null,
    );
    const grant = await prisma.mcpGrant.create({
      data: {
        userId: user.id,
        clientId: client.id,
        resource: "https://fitness.example/mcp",
        scopes: "fitness:read",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await prisma.mcpAuthorizationCode.create({
      data: {
        tokenHash: randomUUID(),
        grantId: grant.id,
        redirectUri: "http://127.0.0.1/callback",
        codeChallenge: "x".repeat(43),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const tokenData = {
      grantId: grant.id,
      accessTokenHash: randomUUID(),
      refreshTokenHash: randomUUID(),
      scopes: "fitness:read",
      accessExpiresAt: new Date(Date.now() + 60000),
      refreshExpiresAt: new Date(Date.now() + 60000),
    };
    await prisma.mcpToken.create({ data: tokenData });
    await assert.rejects(
      prisma.mcpToken.create({
        data: { ...tokenData, refreshTokenHash: randomUUID() },
      }),
    );
    await assert.rejects(
      prisma.mcpToken.create({
        data: { ...tokenData, accessTokenHash: randomUUID() },
      }),
    );
    await prisma.user.delete({ where: { id: user.id } });
    assert.equal(
      await prisma.mcpGrant.count({ where: { userId: user.id } }),
      0,
    );
    assert.equal(
      await prisma.mcpToken.count({ where: { grantId: grant.id } }),
      0,
    );
    assert.equal(
      await prisma.mcpAuthorizationCode.count({ where: { grantId: grant.id } }),
      0,
    );
    assert.equal(
      await prisma.mcpWriteReceipt.count({ where: { userId: user.id } }),
      0,
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.mcpClient.delete({ where: { id: client.id } });
  }
});
