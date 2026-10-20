import { formatDateKey } from "@narumitw/fitness-core/calendar";
import {
  evaluateProgression,
  historyBoundary,
} from "@narumitw/fitness-core/training";
import { prisma } from "./prisma.js";

export async function suggestions(userId: string, workoutId: string) {
  const w = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    include: { sets: true, template: { include: { rules: true } } },
  });
  if (!w?.template || !["ACTIVE", "PAUSED"].includes(w.state)) return [];
  const result = [];
  for (const rule of w.template.rules) {
    const targets = w.sets
      .filter((s) => s.exerciseId === rule.exerciseId)
      .map((s) => ({
        ...s,
        weight: s.targetWeight ?? -1,
        reps: s.targetReps ?? -1,
      }));
    // The most recent session must justify the increase. Do not skip failed sessions.
    const source = await prisma.workout.findFirst({
      where: {
        userId,
        templateId: w.templateId,
        state: "COMPLETED",
        date: { lt: historyBoundary(w.date) },
        sets: { some: { exerciseId: rule.exerciseId } },
      },
      include: { sets: { where: { exerciseId: rule.exerciseId } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    const evaluated = source
      ? evaluateProgression(source.sets, targets, rule.increment)
      : { reason: "missingTargets", weight: null };
    result.push({
      exerciseId: rule.exerciseId,
      increment: rule.increment,
      sourceId: source?.id ?? null,
      sourceDate: source ? formatDateKey(source.date) : null,
      version: w.version,
      ...evaluated,
    });
  }
  return result;
}
