"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { normalizeExerciseAlias, slugifyExerciseName } from "@/lib/exercises";
import { prisma } from "@/lib/prisma";
import { createAliasSchema, createExerciseSchema } from "@/lib/validation";

export async function createExerciseAction(formData: FormData) {
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
}

export async function createExerciseAliasAction(formData: FormData) {
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
}
