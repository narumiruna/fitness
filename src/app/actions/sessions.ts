"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeSession, startSession } from "@/lib/session-service";
import { sessionActualsSchema, updateSetSchema } from "@/lib/validation";

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
  revalidatePath("/", "layout");
  redirect(`/workouts/${workout.id}`);
}
export async function editSessionSetAction(data: FormData) {
  const user = await requireUser();
  const actuals = sessionActualsSchema.parse(Object.fromEntries(data));
  const input = updateSetSchema.parse(Object.fromEntries(data));
  const version = Number(data.get("version"));
  if (!Number.isSafeInteger(version) || version < 0)
    throw new Error("Invalid version.");
  if (data.get("command") === "complete") {
    await changeSession(user.id, {
      workoutId: input.workoutId,
      setId: input.setId,
      version,
      command: "complete",
      actuals,
    });
    revalidatePath("/", "layout");
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
    if (result.count !== 1) throw new Error("Session changed.");
    const changed = await tx.workoutSet.updateMany({
      where: {
        id: input.setId,
        workoutId: input.workoutId,
        exerciseId: input.exerciseId,
        order: input.order,
        type: input.type,
      },
      data: {
        weight: input.weight,
        reps: input.reps,
        rir: input.rir,
        notes: input.notes,
      },
    });
    if (changed.count !== 1) throw new Error("Set changed.");
  });
  revalidatePath("/", "layout");
}
export async function changeSessionAction(data: FormData) {
  const user = await requireUser();
  await changeSession(user.id, {
    workoutId: data.get("workoutId"),
    version: data.get("version"),
    command: data.get("command"),
    setId: data.get("setId") ?? undefined,
    partial: data.get("partial") === "on",
  });
  revalidatePath("/", "layout");
}
