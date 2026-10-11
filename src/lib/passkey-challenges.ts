import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const PASSKEY_CHALLENGE_LIMIT = 1_000;

// Cleanup, count, and insertion must be atomic across application instances.
export async function storePasskeyChallenge(
  data: Prisma.PasskeyChallengeCreateInput,
  previousTokenHash?: string,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.passkeyChallenge.deleteMany({
            where: {
              OR: [
                { expiresAt: { lte: new Date() } },
                ...(previousTokenHash
                  ? [{ tokenHash: previousTokenHash }]
                  : []),
              ],
            },
          });
          if ((await tx.passkeyChallenge.count()) >= PASSKEY_CHALLENGE_LIMIT) {
            throw new Error("Passkey challenge capacity reached.");
          }
          await tx.passkeyChallenge.create({ data });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      // Retry serialization conflicts, but fail closed after three attempts.
      if (
        attempt < 2 &&
        err instanceof Error &&
        "code" in err &&
        err.code === "P2034"
      ) {
        continue;
      }
      throw err;
    }
  }
}
