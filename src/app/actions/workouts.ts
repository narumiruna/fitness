"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSetSchema, createWorkoutSchema } from "@/lib/validation";

export async function createWorkoutAction(formData: FormData) {
  const user = await requireUser();
  const input = createWorkoutSchema.parse({
    title: formData.get("title") || undefined,
    date: formData.get("date"),
    notes: formData.get("notes") || undefined,
  });

  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      title: input.title,
      date: new Date(`${input.date}T00:00:00`),
      notes: input.notes,
    },
  });

  redirect(`/workouts/${workout.id}`);
}

export async function createWorkoutSetAction(formData: FormData) {
  const user = await requireUser();
  const workoutId = String(formData.get("workoutId") ?? "");
  const input = createSetSchema.parse({
    exerciseId: formData.get("exerciseId"),
    weight: formData.get("weight"),
    reps: formData.get("reps"),
    order: formData.get("order"),
    notes: formData.get("notes") || undefined,
  });

  await assertOwnsWorkout(workoutId, user.id);

  await prisma.workoutSet.create({
    data: {
      workoutId,
      exerciseId: input.exerciseId,
      weight: input.weight,
      reps: input.reps,
      order: input.order,
      notes: input.notes,
    },
  });

  revalidatePath(`/workouts/${workoutId}`);
}

export async function deleteWorkoutSetAction(formData: FormData) {
  const user = await requireUser();
  const setId = String(formData.get("setId") ?? "");
  const workoutId = String(formData.get("workoutId") ?? "");

  await assertOwnsWorkout(workoutId, user.id);
  await prisma.workoutSet.delete({ where: { id: setId } });

  revalidatePath(`/workouts/${workoutId}`);
}

export async function deleteWorkoutAction(formData: FormData) {
  const user = await requireUser();
  const workoutId = String(formData.get("workoutId") ?? "");

  await assertOwnsWorkout(workoutId, user.id);
  await prisma.workout.delete({ where: { id: workoutId } });

  redirect("/workouts");
}

async function assertOwnsWorkout(workoutId: string, userId: string) {
  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId,
    },
    select: { id: true },
  });

  if (!workout) {
    redirect("/workouts");
  }
}
