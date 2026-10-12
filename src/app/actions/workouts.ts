"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/calendar";
import { loggedAction } from "@/lib/logged-action";
import { prisma } from "@/lib/prisma";
import {
  createRecordedSet,
  deleteRecordedSet,
  updateRecordedSet,
} from "@/lib/recorded-sets";
import { addCalendarDays } from "@/lib/training";
import {
  createSetSchema,
  createWorkoutFromTemplateSchema,
  createWorkoutSchema,
  deleteWorkoutTemplateSchema,
  duplicateWorkoutSchema,
  saveWorkoutTemplateSchema,
  updateSetSchema,
  updateWorkoutSchema,
} from "@/lib/validation";

export async function createWorkoutAction(formData: FormData) {
  return loggedAction("createWorkoutAction", async () => {
    const user = await requireUser();
    const parsed = createWorkoutSchema.safeParse({
      title: optionalFormString(formData.get("title")),
      date: formData.get("date"),
      notes: optionalFormString(formData.get("notes")),
    });

    if (!parsed.success) return { error: "invalidWorkoutInput" as const };
    const input = parsed.data;
    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        title: input.title,
        date: new Date(`${input.date}T00:00:00`),
        notes: input.notes,
      },
    });

    redirect(`/workouts/${workout.id}`);
  });
}

export async function updateWorkoutAction(formData: FormData) {
  return loggedAction("updateWorkoutAction", async () => {
    const user = await requireUser();
    const input = updateWorkoutSchema.parse({
      workoutId: formData.get("workoutId"),
      title: optionalFormString(formData.get("title")),
      date: formData.get("date"),
      notes: optionalFormString(formData.get("notes")),
    });

    await assertOwnsWorkout(input.workoutId, user.id);
    await prisma.workout.update({
      where: { id: input.workoutId },
      data: {
        title: input.title,
        date: dateFromKey(input.date),
        notes: input.notes,
        version: { increment: 1 },
      },
    });

    revalidatePath("/", "layout");
    revalidatePath(`/workouts/${input.workoutId}`);
  });
}

export async function duplicateWorkoutAction(formData: FormData) {
  return loggedAction("duplicateWorkoutAction", async () => {
    const user = await requireUser();
    const input = duplicateWorkoutSchema.parse({
      sourceWorkoutId: formData.get("sourceWorkoutId"),
      date: formData.get("date"),
    });
    const sourceWorkout = await prisma.workout.findFirst({
      where: {
        id: input.sourceWorkoutId,
        userId: user.id,
        state: "COMPLETED",
      },
      include: {
        sets: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!sourceWorkout) {
      redirect("/workouts");
    }

    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        title: sourceWorkout.title,
        date: dateFromKey(input.date),
        notes: sourceWorkout.notes,
        sets: {
          create: sourceWorkout.sets
            .filter((set) => set.completed)
            .map((set) => ({
              exerciseId: set.exerciseId,
              order: set.order,
              weight: set.weight,
              reps: set.reps,
              notes: set.notes,
              type: set.type,
            })),
        },
      },
    });

    revalidatePath("/", "layout");
    redirect(`/workouts/${workout.id}`);
  });
}

export async function createWorkoutSetAction(formData: FormData) {
  return loggedAction("createWorkoutSetAction", async () => {
    const user = await requireUser();
    const workoutId = String(formData.get("workoutId") ?? "");
    const input = createSetSchema.parse({
      exerciseId: formData.get("exerciseId"),
      weight: formData.get("weight"),
      reps: formData.get("reps"),
      order: formData.get("order"),
      type: formData.get("type") ?? undefined,
      rir: formData.get("rir"),
      notes: optionalFormString(formData.get("notes")),
    });

    await createRecordedSet(user.id, workoutId, input);

    revalidatePath("/", "layout");
  });
}

export async function updateWorkoutSetAction(formData: FormData) {
  return loggedAction("updateWorkoutSetAction", async () => {
    const user = await requireUser();
    const input = updateSetSchema.parse({
      workoutId: formData.get("workoutId"),
      setId: formData.get("setId"),
      exerciseId: formData.get("exerciseId"),
      weight: formData.get("weight"),
      reps: formData.get("reps"),
      order: formData.get("order"),
      type: formData.get("type") ?? undefined,
      rir: formData.get("rir"),
      notes: optionalFormString(formData.get("notes")),
    });

    const result = await updateRecordedSet(user.id, input, {
      type: formData.has("type"),
      rir: formData.has("rir"),
    });

    if (result.count === 0) {
      redirect(`/workouts/${input.workoutId}`);
    }

    revalidatePath("/", "layout");
    revalidatePath(`/workouts/${input.workoutId}`);
  });
}

export async function deleteWorkoutSetAction(formData: FormData) {
  return loggedAction("deleteWorkoutSetAction", async () => {
    const user = await requireUser();
    const setId = String(formData.get("setId") ?? "");
    const workoutId = String(formData.get("workoutId") ?? "");

    await deleteRecordedSet(user.id, workoutId, setId);

    revalidatePath("/", "layout");
    revalidatePath(`/workouts/${workoutId}`);
  });
}

export async function deleteWorkoutAction(formData: FormData) {
  return loggedAction("deleteWorkoutAction", async () => {
    const user = await requireUser();
    const workoutId = String(formData.get("workoutId") ?? "");

    await assertOwnsWorkout(workoutId, user.id);
    await prisma.workout.delete({ where: { id: workoutId } });

    redirect("/workouts");
  });
}

export async function saveWorkoutTemplateAction(formData: FormData) {
  return loggedAction("saveWorkoutTemplateAction", async () => {
    const user = await requireUser();
    const input = saveWorkoutTemplateSchema.parse({
      workoutId: formData.get("workoutId"),
      title: formData.get("title"),
    });
    const workout = await prisma.workout.findFirst({
      where: {
        id: input.workoutId,
        userId: user.id,
        state: "COMPLETED",
      },
      include: {
        sets: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!workout) {
      redirect("/workouts");
    }

    await prisma.workoutTemplate.create({
      data: {
        userId: user.id,
        title: input.title,
        notes: workout.notes,
        sets: {
          create: workout.sets
            .filter((set) => set.completed)
            .map((set) => ({
              exerciseId: set.exerciseId,
              order: set.order,
              weight: set.weight,
              reps: set.reps,
              notes: set.notes,
              type: set.type,
            })),
        },
      },
    });

    revalidatePath("/", "layout");
    revalidatePath(`/workouts/${input.workoutId}`);
  });
}

export async function createWorkoutFromTemplateAction(formData: FormData) {
  return loggedAction("createWorkoutFromTemplateAction", async () => {
    const user = await requireUser();
    const input = createWorkoutFromTemplateSchema.parse({
      templateId: formData.get("templateId"),
      date: formData.get("date"),
    });
    const template = await prisma.workoutTemplate.findFirst({
      where: {
        id: input.templateId,
        userId: user.id,
      },
      include: {
        sets: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!template) {
      redirect("/workouts");
    }

    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        title: template.title,
        date: dateFromKey(input.date),
        notes: template.notes,
        sets: {
          create: template.sets.map((set) => ({
            exerciseId: set.exerciseId,
            order: set.order,
            weight: set.weight,
            reps: set.reps,
            notes: set.notes,
            type: set.type,
          })),
        },
      },
    });

    revalidatePath("/", "layout");
    redirect(`/workouts/${workout.id}`);
  });
}

export async function deleteWorkoutTemplateAction(formData: FormData) {
  return loggedAction("deleteWorkoutTemplateAction", async () => {
    const user = await requireUser();
    const input = deleteWorkoutTemplateSchema.parse({
      templateId: formData.get("templateId"),
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() },
      });
      const cutoff = parseDateKey(
        addCalendarDays(formatDateKey(new Date()), 1),
      ) as Date;
      await tx.templateSchedule.deleteMany({
        where: {
          userId: user.id,
          templateId: input.templateId,
          effectiveFrom: { gte: cutoff },
        },
      });
      await tx.templateSchedule.updateMany({
        where: {
          userId: user.id,
          templateId: input.templateId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: cutoff } }],
        },
        data: { effectiveTo: cutoff },
      });
      await tx.workoutTemplate.deleteMany({
        where: { id: input.templateId, userId: user.id },
      });
    });

    revalidatePath("/", "layout");
  });
}

async function assertOwnsWorkout(workoutId: string, userId: string) {
  const workout = await prisma.workout.findFirst({
    where: {
      id: workoutId,
      userId,
    },
    select: { id: true, state: true, version: true },
  });

  if (!workout) {
    redirect("/workouts");
  }
  return workout;
}

function dateFromKey(date: string) {
  return new Date(`${date}T00:00:00`);
}

function optionalFormString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}
