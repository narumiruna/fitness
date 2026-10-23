import { randomUUID } from "node:crypto";
import { ApiError, redirect } from "../errors.js";
import { Prisma } from "../generated/prisma/client.js";
import { requireUser } from "../lib/auth.js";
import {
  exerciseHasName,
  normalizeExerciseAlias,
  slugifyExerciseName,
} from "../lib/exercises.js";
import { loggedAction } from "../lib/logged-action.js";
import { prisma } from "../lib/prisma.js";
import {
  createAliasSchema,
  createExerciseSchema,
  updateExerciseSchema,
} from "../lib/validation.js";

export async function createExerciseAction(formData: FormData) {
  return loggedAction("createExerciseAction", async () => {
    const user = await requireUser();
    const input = createExerciseSchema.parse({
      defaultName: formData.get("defaultName"),
    });
    const normalizedAlias = normalizeExerciseAlias(input.defaultName);
    const existing = await prisma.exercise.findMany({
      select: { defaultName: true, names: { select: { name: true } } },
    });
    if (existing.some((exercise) => exerciseHasName(exercise, normalizedAlias)))
      redirect("/exercises?error=duplicate");

    const slug = slugifyExerciseName(input.defaultName) || "exercise";
    const create = (slug: string) =>
      prisma.exercise.create({
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
              normalizedAlias,
            },
          },
        },
      });

    const exercise = await create(slug)
      .catch((error: unknown) => {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
        // Slugs are identifiers, not names. The unique alias still rejects
        // concurrent duplicate names when a slug collision needs a retry.
        return create(`${slug}-${randomUUID()}`);
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          redirect("/exercises?error=duplicate");
        throw error;
      });

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
        if (!exercise) throw new ApiError(403, "FORBIDDEN");

        const otherExercises = await tx.exercise.findMany({
          where: { id: { not: exercise.id } },
          select: { defaultName: true, names: { select: { name: true } } },
        });
        if (
          otherExercises.some((other) =>
            exerciseHasName(other, normalizedAlias),
          )
        )
          redirect(`${path}?error=duplicate#edit-exercise`);

        // Imported exercises can have no name or alias records yet.
        await tx.exerciseName.upsert({
          where: {
            exerciseId_locale_name: {
              exerciseId: exercise.id,
              locale: "en",
              name: exercise.defaultName,
            },
          },
          create: {
            exerciseId: exercise.id,
            locale: "en",
            name: exercise.defaultName,
            isPrimary: false,
          },
          update: {},
        });

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
  });
}
