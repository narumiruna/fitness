import {
  normalizeExerciseAlias,
  slugifyExerciseName,
} from "../src/lib/exercises";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

async function main() {
  const adminPasswordHash = await hashPassword("admin");

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
    create: {
      username: "admin",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  await seedExercise("Deadlift", [
    { locale: "en", alias: "deadlift" },
    { locale: "zh-TW", alias: "硬舉" },
  ]);
  await seedExercise("Squat", [
    { locale: "en", alias: "squat" },
    { locale: "zh-TW", alias: "深蹲" },
  ]);
  await seedExercise("Bench Press", [
    { locale: "en", alias: "bench press" },
    { locale: "zh-TW", alias: "臥推" },
  ]);
}

async function seedExercise(
  defaultName: string,
  aliases: Array<{ locale: string; alias: string }>,
) {
  const exercise = await prisma.exercise.upsert({
    where: { slug: slugifyExerciseName(defaultName) },
    update: { defaultName },
    create: {
      slug: slugifyExerciseName(defaultName),
      defaultName,
      names: {
        create: {
          locale: "en",
          name: defaultName,
          isPrimary: true,
        },
      },
    },
  });

  for (const item of aliases) {
    await prisma.exerciseAlias.upsert({
      where: {
        locale_normalizedAlias: {
          locale: item.locale,
          normalizedAlias: normalizeExerciseAlias(item.alias),
        },
      },
      update: {
        alias: item.alias,
        exerciseId: exercise.id,
      },
      create: {
        locale: item.locale,
        alias: item.alias,
        normalizedAlias: normalizeExerciseAlias(item.alias),
        exerciseId: exercise.id,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
