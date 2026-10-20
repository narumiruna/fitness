import type { z } from "zod";
import { ApiError } from "../errors.js";
import { prisma } from "./prisma.js";
import type { createSetSchema, updateSetSchema } from "./validation.js";
export async function createRecordedSet(
  userId: string,
  workoutId: string,
  input: z.infer<typeof createSetSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.workout.updateMany({
      where: { id: workoutId, userId, state: "COMPLETED" },
      data: { version: { increment: 1 } },
    });
    if (owned.count !== 1) throw new ApiError(404, "NOT_FOUND");
    await tx.workoutSet.create({ data: { workoutId, ...input } });
  });
}
export async function updateRecordedSet(
  userId: string,
  input: z.infer<typeof updateSetSchema>,
  provided = { type: true, rir: true },
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.workout.updateMany({
      where: { id: input.workoutId, userId, state: "COMPLETED" },
      data: { version: { increment: 1 } },
    });
    if (owned.count !== 1) throw new ApiError(404, "NOT_FOUND");
    const { workoutId, setId, ...values } = input;
    return tx.workoutSet.updateMany({
      where: { id: setId, workoutId },
      data: {
        ...values,
        type: provided.type ? values.type : undefined,
        rir: provided.rir ? values.rir : undefined,
      },
    });
  });
}
export async function deleteRecordedSet(
  userId: string,
  workoutId: string,
  setId: string,
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.workout.updateMany({
      where: { id: workoutId, userId, state: "COMPLETED" },
      data: { version: { increment: 1 } },
    });
    if (owned.count !== 1) throw new ApiError(404, "NOT_FOUND");
    await tx.workoutSet.deleteMany({ where: { id: setId, workoutId } });
  });
}
