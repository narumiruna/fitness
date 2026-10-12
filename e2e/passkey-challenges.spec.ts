import { expect, test } from "@playwright/test";
import {
  PASSKEY_CHALLENGE_LIMIT,
  storePasskeyChallenge,
} from "../src/lib/passkey-challenges";
import { prisma } from "../src/lib/prisma";

// The UI runner permits only disposable SQLite files or PostgreSQL containers.
test.beforeEach(async () => {
  await prisma.passkeyChallenge.deleteMany();
});
test.afterAll(async () => {
  await prisma.passkeyChallenge.deleteMany();
  await prisma.$disconnect();
});

function challenge(
  tokenHash: string,
  expiresAt = new Date(Date.now() + 300_000),
) {
  return {
    tokenHash,
    challenge: "test-challenge",
    purpose: "authenticate",
    expiresAt,
  };
}

async function fill(count: number) {
  await prisma.passkeyChallenge.createMany({
    data: Array.from({ length: count }, (_, index) =>
      challenge(`existing-${index}`),
    ),
  });
}

test("anonymous challenge issuance fails closed at the database-wide limit", async () => {
  await fill(PASSKEY_CHALLENGE_LIMIT);
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(
      storePasskeyChallenge(challenge(`denied-${attempt}`)),
    ).rejects.toThrow("capacity reached");
  }
  expect(await prisma.passkeyChallenge.count()).toBe(PASSKEY_CHALLENGE_LIMIT);
  expect(
    await prisma.passkeyChallenge.count({
      where: { tokenHash: { startsWith: "denied-" } },
    }),
  ).toBe(0);
});

test("concurrent anonymous issuance cannot exceed the limit", async () => {
  await fill(PASSKEY_CHALLENGE_LIMIT - 1);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      storePasskeyChallenge(challenge(`concurrent-${index}`)),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    7,
  );
  expect(await prisma.passkeyChallenge.count()).toBe(PASSKEY_CHALLENGE_LIMIT);
});

test("previous-cookie replacement and expired cleanup recover capacity", async () => {
  await fill(PASSKEY_CHALLENGE_LIMIT);
  await storePasskeyChallenge(challenge("replacement"), "existing-0");
  expect(
    await prisma.passkeyChallenge.findUnique({
      where: { tokenHash: "existing-0" },
    }),
  ).toBeNull();
  expect(await prisma.passkeyChallenge.count()).toBe(PASSKEY_CHALLENGE_LIMIT);
  await prisma.passkeyChallenge.updateMany({
    data: { expiresAt: new Date(0) },
  });
  await storePasskeyChallenge(challenge("after-expiry"));
  expect(await prisma.passkeyChallenge.count()).toBe(1);
  expect(
    await prisma.passkeyChallenge.findUnique({
      where: { tokenHash: "after-expiry" },
    }),
  ).not.toBeNull();
});
