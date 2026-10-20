import {
  evaluateProgression,
  historyBoundary,
} from "@narumitw/fitness-core/training";
import { ApiError } from "../errors.js";
import { requireUser } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  acceptProgressionSchema,
  progressionRuleSchema,
} from "../lib/validation.js";

export async function saveProgressionRuleAction(data: FormData) {
  const user = await requireUser();
  const templateId = String(data.get("templateId") ?? "");
  const exerciseId = String(data.get("exerciseId") ?? "");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });
    const template = await tx.workoutTemplate.findFirst({
      where: {
        id: templateId,
        userId: user.id,
        sets: { some: { exerciseId } },
      },
    });
    if (!template) throw new ApiError(404, "NOT_FOUND");
    if (data.get("disabled") === "on")
      await tx.progressionRule.deleteMany({
        where: { templateId, exerciseId },
      });
    else {
      const input = progressionRuleSchema.parse(Object.fromEntries(data));
      await tx.progressionRule.upsert({
        where: { templateId_exerciseId: { templateId, exerciseId } },
        create: input,
        update: { increment: input.increment },
      });
    }
  });
}
export async function acceptProgressionAction(data: FormData) {
  const user = await requireUser();
  const input = acceptProgressionSchema.parse(Object.fromEntries(data));
  const { workoutId, exerciseId, version } = input;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });
    const w = await tx.workout.findFirst({
      where: {
        id: workoutId,
        userId: user.id,
        version,
        state: { in: ["ACTIVE", "PAUSED"] },
      },
      include: { sets: true },
    });
    if (!w?.templateId) throw new ApiError(409, "CONFLICT");
    const rule = await tx.progressionRule.findUnique({
      where: {
        templateId_exerciseId: { templateId: w.templateId, exerciseId },
      },
    });
    const source = await tx.workout.findFirst({
      where: {
        userId: user.id,
        templateId: w.templateId,
        state: "COMPLETED",
        date: { lt: historyBoundary(w.date) },
        sets: { some: { exerciseId } },
      },
      include: { sets: { where: { exerciseId } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    if (!rule || !source || source.id !== input.sourceId)
      throw new ApiError(409, "CONFLICT");
    const sourceLock = await tx.workout.updateMany({
      where: {
        id: source.id,
        userId: user.id,
        version: source.version,
        state: "COMPLETED",
      },
      data: { version: { increment: 0 } },
    });
    if (sourceLock.count !== 1) throw new ApiError(409, "CONFLICT");
    const targets = w.sets.filter((s) => s.exerciseId === exerciseId);
    if (targets.some((s) => s.completed)) throw new ApiError(409, "CONFLICT");
    const result = evaluateProgression(
      source.sets,
      targets.map((s) => ({
        ...s,
        weight: s.targetWeight ?? -1,
        reps: s.targetReps ?? -1,
      })),
      rule.increment,
    );
    if (result.weight === null || result.weight !== input.weight)
      throw new ApiError(409, "CONFLICT");
    const lock = await tx.workout.updateMany({
      where: { id: w.id, userId: user.id, version },
      data: { version: { increment: 1 } },
    });
    if (lock.count !== 1) throw new ApiError(409, "CONFLICT");
    await tx.workoutSet.updateMany({
      where: { workoutId: w.id, exerciseId, type: "WORKING", completed: false },
      data: { targetWeight: result.weight },
    });
  });
}
