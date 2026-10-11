"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateProgression, historyBoundary } from "@/lib/training";
import { progressionRuleSchema } from "@/lib/validation";

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
    if (!template) throw new Error("Template not found.");
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
  revalidatePath("/", "layout");
}
export async function acceptProgressionAction(data: FormData) {
  const user = await requireUser();
  const workoutId = String(data.get("workoutId") ?? "");
  const exerciseId = String(data.get("exerciseId") ?? "");
  const version = Number(data.get("version"));
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
    if (!w?.templateId) throw new Error("Session changed.");
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
    if (!rule || !source || source.id !== data.get("sourceId"))
      throw new Error("Source changed.");
    const sourceLock = await tx.workout.updateMany({
      where: {
        id: source.id,
        userId: user.id,
        version: source.version,
        state: "COMPLETED",
      },
      data: { version: { increment: 0 } },
    });
    if (sourceLock.count !== 1) throw new Error("Source changed.");
    const targets = w.sets.filter((s) => s.exerciseId === exerciseId);
    if (targets.some((s) => s.completed))
      throw new Error("Exercise already started.");
    const result = evaluateProgression(
      source.sets,
      targets.map((s) => ({
        ...s,
        weight: s.targetWeight ?? -1,
        reps: s.targetReps ?? -1,
      })),
      rule.increment,
    );
    if (result.weight === null || result.weight !== Number(data.get("weight")))
      throw new Error("Suggestion changed.");
    const lock = await tx.workout.updateMany({
      where: { id: w.id, userId: user.id, version },
      data: { version: { increment: 1 } },
    });
    if (lock.count !== 1) throw new Error("Session changed.");
    await tx.workoutSet.updateMany({
      where: { workoutId: w.id, exerciseId, type: "WORKING", completed: false },
      data: { targetWeight: result.weight },
    });
  });
  revalidatePath("/", "layout");
}
