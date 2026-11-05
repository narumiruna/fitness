import type { z } from "zod";
import { ApiError } from "../errors.js";
import { prisma } from "./prisma.js";
import {
  type createRecordedSetSchema,
  reorderWorkoutSetsSchema,
  type updateSetSchema,
} from "./validation.js";
export async function createRecordedSet(
  userId: string,
  workoutId: string,
  input: z.infer<typeof createRecordedSetSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.workout.updateMany({
      where: { id: workoutId, userId, state: "COMPLETED" },
      data: { version: { increment: 1 } },
    });
    if (owned.count !== 1) throw new ApiError(404, "NOT_FOUND");
    // The parent write serializes appends and reorders for this workout.
    const last = await tx.workoutSet.aggregate({
      where: { workoutId },
      _max: { order: true },
      _count: { _all: true },
    });
    let order = input.order ?? (last._max.order ?? 0) + 1;
    if (input.order === undefined) {
      if (last._count._all >= 1000) throw new ApiError(400, "VALIDATION_ERROR");
      if (order > 1000) {
        const sets = await tx.workoutSet.findMany({
          where: { workoutId },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        for (const [index, set] of sets.entries()) {
          await tx.workoutSet.update({
            where: { id: set.id },
            data: { order: index + 1 },
          });
        }
        order = sets.length + 1;
      }
    }
    await tx.workoutSet.create({ data: { workoutId, ...input, order } });
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
    // Result edits must not restore stale form order after a reorder.
    const { workoutId, setId, order: _order, ...values } = input;
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

export async function reorderRecordedSets(userId: string, raw: unknown) {
  const input = reorderWorkoutSetsSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const workout = await tx.workout.findFirst({
      where: { id: input.workoutId, userId, state: "COMPLETED" },
      select: { id: true },
    });
    if (!workout) throw new ApiError(404, "NOT_FOUND");
    const locked = await tx.workout.updateMany({
      where: {
        id: workout.id,
        userId,
        state: "COMPLETED",
        version: input.version,
      },
      data: { version: { increment: 1 } },
    });
    if (locked.count !== 1) throw new ApiError(409, "CONFLICT");
    const sets = await tx.workoutSet.findMany({
      where: { workoutId: workout.id },
      select: { id: true },
    });
    const currentIds = new Set(sets.map((set) => set.id));
    if (
      currentIds.size !== input.setIds.length ||
      input.setIds.some((id) => !currentIds.has(id))
    )
      throw new ApiError(400, "VALIDATION_ERROR");
    for (const [index, id] of input.setIds.entries()) {
      await tx.workoutSet.update({
        where: { id },
        data: { order: index + 1 },
      });
    }
  });
}
