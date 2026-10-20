import { redirect } from "../errors.js";
import { requireUser } from "../lib/auth.js";
import { SessionError, sessionOutcome } from "../lib/form-outcome.js";
import { prisma } from "../lib/prisma.js";
import { changeSession, startSession } from "../lib/session-service.js";
import { sessionActualsSchema, updateSetSchema } from "../lib/validation.js";

export async function startSessionAction(data: FormData) {
  const user = await requireUser();
  const workout = await startSession(user.id, {
    sourceId: data.get("sourceId"),
    source: data.get("source"),
    date: data.get("date"),
    key: data.get("key"),
    restSeconds: data.get("restSeconds") ?? 90,
    scheduled: data.get("scheduled") === "true",
  });

  redirect(`/workouts/${workout.id}`);
}
export async function editSessionSetAction(data: FormData) {
  const user = await requireUser();
  return sessionOutcome(async () => {
    const actuals = sessionActualsSchema.parse(Object.fromEntries(data));
    const input = updateSetSchema.parse(Object.fromEntries(data));
    const version = Number(data.get("version"));
    if (!Number.isSafeInteger(version) || version < 0)
      throw new SessionError("invalidSessionInput");
    if (data.get("command") === "complete") {
      await changeSession(user.id, {
        workoutId: input.workoutId,
        setId: input.setId,
        version,
        command: "complete",
        actuals,
      });

      return;
    }
    await prisma.$transaction(async (tx) => {
      const result = await tx.workout.updateMany({
        where: {
          id: input.workoutId,
          userId: user.id,
          version,
          state: { in: ["ACTIVE", "PAUSED"] },
        },
        data: { version: { increment: 1 } },
      });
      if (result.count !== 1) throw new SessionError("sessionConflict");
      const changed = await tx.workoutSet.updateMany({
        where: {
          id: input.setId,
          workoutId: input.workoutId,
          exerciseId: input.exerciseId,
          order: input.order,
          type: input.type,
        },
        data: {
          actualsEntered: true,
          weight: input.weight,
          reps: input.reps,
          rir: input.rir,
          notes: input.notes,
        },
      });
      if (changed.count !== 1) throw new SessionError("sessionUnavailable");
    });
  });
}
export async function changeSessionAction(data: FormData) {
  const user = await requireUser();
  return sessionOutcome(async () => {
    await changeSession(user.id, {
      workoutId: data.get("workoutId"),
      version: data.get("version"),
      command: data.get("command"),
      setId: data.get("setId") ?? undefined,
      partial: data.get("partial") === "on",
    });
  });
}
