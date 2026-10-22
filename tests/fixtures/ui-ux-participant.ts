import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../apps/api/src/lib/prisma";

// Only use through the disposable UI runner; never provision a real account.
export async function createParticipantFixture() {
  const password = "review-only-password";
  const user = await prisma.user.create({
    data: {
      username: `participant-${randomUUID()}`,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  let exerciseId: string | undefined;
  async function cleanup() {
    try {
      await prisma.user.deleteMany({ where: { id: user.id } });
    } finally {
      if (exerciseId)
        await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    }
  }
  try {
    const exercise = await prisma.exercise.create({
      data: {
        slug: randomUUID(),
        defaultName: "Bench Press",
        createdByUserId: user.id,
        names: {
          create: { locale: "zh-TW", name: "槓鈴臥推", isPrimary: true },
        },
      },
    });
    exerciseId = exercise.id;
    await prisma.workoutTemplate.create({
      data: {
        userId: user.id,
        title: "Upper body / 上肢課表",
        sets: {
          create: { exerciseId, order: 1, weight: 20, reps: 8 },
        },
      },
    });
    return {
      userId: user.id,
      username: user.username,
      password,
      exerciseId,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
