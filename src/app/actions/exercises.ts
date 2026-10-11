"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { normalizeExerciseAlias, slugifyExerciseName } from "@/lib/exercises";
import { loggedAction } from "@/lib/logged-action";
import { prisma } from "@/lib/prisma";
import {
  createAliasSchema,
  createExerciseSchema,
  updateExerciseSchema,
} from "@/lib/validation";

export async function createExerciseAction(formData: FormData) {
  return loggedAction("createExerciseAction", async () => {
    const user = await requireUser();
    const input = createExerciseSchema.parse({
      defaultName: formData.get("defaultName"),
    });
    const slug = slugifyExerciseName(input.defaultName);

    const exercise = await prisma.exercise
      .create({
        data: {
          slug,
          defaultName: input.defaultName,
          createdByUserId: user.id,
          names: {
            create: {
              locale: "en",
              name: input.defaultName,
              isPrimary: true,
            },
          },
          aliases: {
            create: {
              locale: "en",
              alias: input.defaultName,
              normalizedAlias: normalizeExerciseAlias(input.defaultName),
            },
          },
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          redirect("/exercises?error=duplicate");
        throw error;
      });

    revalidatePath("/exercises");
    redirect(`/exercises?created=${exercise.id}`);
  });
}

export async function updateExerciseAction(formData: FormData) {
  return loggedAction("updateExerciseAction", async () => {
    const user = await requireUser();
    const input = updateExerciseSchema.parse({
      exerciseId: formData.get("exerciseId"),
      defaultName: formData.get("defaultName"),
    });
    const path = `/exercises/${encodeURIComponent(input.exerciseId)}`;
    const normalizedAlias = normalizeExerciseAlias(input.defaultName);

    await prisma
      .$transaction(async (tx) => {
        const exercise = await tx.exercise.findFirst({
          where: {
            id: input.exerciseId,
            ...(user.role === "ADMIN" ? {} : { createdByUserId: user.id }),
          },
        });
        if (!exercise) throw new Error("Not permitted.");

        const duplicate = await tx.exercise.findFirst({
          where: {
            id: { not: exercise.id },
            OR: [
              { defaultName: input.defaultName },
              { names: { some: { name: input.defaultName } } },
            ],
          },
          select: { id: true },
        });
        if (duplicate) redirect(`${path}?error=duplicate#edit-exercise`);

        await tx.exercise.update({
          where: { id: exercise.id },
          data: {
            defaultName: input.defaultName,
          },
        });
        await tx.exerciseName.updateMany({
          where: { exerciseId: exercise.id, locale: "en", isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.exerciseName.upsert({
          where: {
            exerciseId_locale_name: {
              exerciseId: exercise.id,
              locale: "en",
              name: input.defaultName,
            },
          },
          create: {
            exerciseId: exercise.id,
            locale: "en",
            name: input.defaultName,
            isPrimary: true,
          },
          update: { isPrimary: true },
        });
        // Keep earlier aliases so searches and imports still find this exercise.
        const alias = await tx.exerciseAlias.findFirst({
          where: { exerciseId: exercise.id, locale: "en", normalizedAlias },
        });
        if (!alias)
          await tx.exerciseAlias.create({
            data: {
              exerciseId: exercise.id,
              locale: "en",
              alias: input.defaultName,
              normalizedAlias,
            },
          });
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          redirect(`${path}?error=duplicate#edit-exercise`);
        throw error;
      });

    revalidatePath("/", "layout");
    redirect(`${path}?saved=1#edit-exercise`);
  });
}

export async function createExerciseAliasAction(formData: FormData) {
  return loggedAction("createExerciseAliasAction", async () => {
    await requireUser();
    const input = createAliasSchema.parse({
      exerciseId: formData.get("exerciseId"),
      locale: formData.get("locale"),
      alias: formData.get("alias"),
    });

    await prisma.exerciseAlias
      .create({
        data: {
          exerciseId: input.exerciseId,
          locale: input.locale,
          alias: input.alias,
          normalizedAlias: normalizeExerciseAlias(input.alias),
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          redirect("/exercises?error=alias");
        throw error;
      });

    revalidatePath("/exercises");
  });
}
