import { prisma } from "./prisma";
import { createWorkoutDraftSchema } from "./validation";

export async function createRecordedWorkout(userId: string, raw: unknown) {
  const input = createWorkoutDraftSchema.parse(raw);
  // Namespace the existing unique key separately from live-session starts.
  const startKey = `recorded:${userId}:${input.key}`;
  return prisma.$transaction(async (tx) => {
    // The user-row lock serializes concurrent submissions before the lookup.
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
    const existing = await tx.workout.findFirst({
      where: { userId, startKey },
      select: { id: true },
    });
    if (existing) return existing;
    return tx.workout.create({
      data: {
        userId,
        startKey,
        title: input.title,
        date: new Date(`${input.date}T00:00:00`),
        notes: input.notes,
      },
      select: { id: true },
    });
  });
}
