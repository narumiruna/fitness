import { formatDateKey, parseDateKey } from "@narumitw/fitness-core/calendar";
import { transition } from "@narumitw/fitness-core/training";
import { ApiError } from "../errors.js";
import { SessionError } from "./form-outcome.js";
import { prisma } from "./prisma.js";
import { sessionChangeSchema, sessionStartSchema } from "./validation.js";

export async function startSession(userId: string, raw: unknown) {
  const input = sessionStartSchema.parse(raw);
  const date = parseDateKey(input.date);
  if (!date) throw new ApiError(400, "VALIDATION_ERROR");
  const key = `${userId}:${input.key}`;
  return prisma.$transaction(async (tx) => {
    // Serialize starts for the same user, including distinct keys for one occurrence.
    await tx.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
    const existing = await tx.workout.findFirst({
      where: {
        userId,
        OR: [
          { startKey: key },
          ...(input.scheduled ? [{ plannedDate: date }] : []),
        ],
      },
    });
    if (existing) return existing;
    if (input.scheduled) {
      if (input.date < formatDateKey(new Date()))
        throw new ApiError(409, "CONFLICT");
      const assignment = await tx.templateSchedule.findFirst({
        where: {
          userId,
          templateId: input.sourceId,
          weekday: date.getDay(),
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
        },
      });
      if (!assignment || input.source !== "template")
        throw new ApiError(409, "CONFLICT");
    }
    const source =
      input.source === "template"
        ? await tx.workoutTemplate.findFirst({
            where: { id: input.sourceId, userId },
            include: { sets: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
          })
        : await tx.workout.findFirst({
            where: { id: input.sourceId, userId, state: "COMPLETED" },
            include: {
              sets: {
                where: { completed: true },
                orderBy: [{ order: "asc" }, { id: "asc" }],
              },
            },
          });
    if (!source) throw new ApiError(404, "NOT_FOUND");
    const now = new Date();
    return tx.workout.create({
      data: {
        userId,
        date,
        title: source.title,
        notes: source.notes,
        state: "ACTIVE",
        startKey: key,
        startedAt: now,
        resumedAt: now,
        restSeconds: input.restSeconds,
        templateId: input.source === "template" ? source.id : null,
        templateTitle: input.source === "template" ? source.title : null,
        plannedDate: input.scheduled ? date : null,
        sets: {
          create: source.sets.map((s) => ({
            exerciseId: s.exerciseId,
            order: s.order,
            type: s.type,
            targetWeight: s.weight,
            targetReps: s.reps,
            weight: 0,
            reps: 1,
            notes: s.notes,
            completed: false,
            actualsEntered: false,
          })),
        },
      },
    });
  });
}
export async function changeSession(userId: string, raw: unknown) {
  const input = sessionChangeSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const w = await tx.workout.findFirst({
      where: { id: input.workoutId, userId },
      include: { sets: true },
    });
    if (!w) throw new SessionError("sessionUnavailable");
    // A retry of an already confirmed operation is a no-op. Other stale writes fail.
    if (
      input.command === "complete" &&
      w.sets.find((s) => s.id === input.setId)?.completed
    )
      return;
    const requested =
      input.command === "complete"
        ? undefined
        : {
            pause: "PAUSED",
            resume: "ACTIVE",
            finish: "COMPLETED",
            abandon: "ABANDONED",
          }[input.command];
    if (requested === w.state) return;
    if (w.version !== input.version) throw new SessionError("sessionConflict");
    const now = new Date();
    if (input.command === "complete") {
      if (
        w.state !== "ACTIVE" ||
        !input.setId ||
        !input.actuals ||
        !w.sets.some((s) => s.id === input.setId)
      )
        throw new SessionError("sessionUnavailable");
      const lock = await tx.workout.updateMany({
        where: { id: w.id, userId, version: w.version, state: "ACTIVE" },
        data: {
          version: { increment: 1 },
          restDeadline: new Date(now.getTime() + w.restSeconds * 1000),
        },
      });
      if (lock.count !== 1) throw new SessionError("sessionConflict");
      await tx.workoutSet.update({
        where: { id: input.setId },
        data: { ...input.actuals, actualsEntered: true, completed: true },
      });
      return;
    }
    if (w.state !== "ACTIVE" && w.state !== "PAUSED")
      throw new SessionError("sessionUnavailable");
    if (
      (input.command === "pause" && w.state !== "ACTIVE") ||
      (input.command === "resume" && w.state !== "PAUSED")
    )
      throw new SessionError("sessionUnavailable");
    const state = transition(w.state, input.command);
    if (
      state === "COMPLETED" &&
      w.sets.some((s) => !s.completed) &&
      !input.partial
    )
      throw new SessionError("sessionIncomplete");
    const elapsed =
      w.state === "ACTIVE" && w.resumedAt
        ? Math.max(
            0,
            Math.floor((now.getTime() - w.resumedAt.getTime()) / 1000),
          )
        : 0;
    const result = await tx.workout.updateMany({
      where: { id: w.id, userId, version: w.version, state: w.state },
      data: {
        state,
        version: { increment: 1 },
        activeSeconds: w.activeSeconds + elapsed,
        resumedAt: state === "ACTIVE" ? now : null,
        finishedAt: state === "COMPLETED" || state === "ABANDONED" ? now : null,
        restDeadline: null,
      },
    });
    if (result.count !== 1) throw new SessionError("sessionConflict");
  });
}
