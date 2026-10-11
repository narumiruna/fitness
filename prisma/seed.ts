import {
  normalizeExerciseAlias,
  slugifyExerciseName,
} from "../src/lib/exercises";
import { logger } from "../src/lib/logger";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";

async function main() {
  logger.info({ event: "seed.started" }, "Development seed started");
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
  await seedExercise("Overhead Press", [
    { locale: "en", alias: "overhead press" },
    { locale: "zh-TW", alias: "肩推" },
  ]);
  await seedExercise("Barbell Row", [
    { locale: "en", alias: "barbell row" },
    { locale: "zh-TW", alias: "槓鈴划船" },
  ]);
  await seedExercise("Pull-up", [
    { locale: "en", alias: "pull-up" },
    { locale: "en", alias: "pull up" },
    { locale: "zh-TW", alias: "引體向上" },
  ]);
  await seedExercise("Lat Pulldown", [
    { locale: "en", alias: "lat pulldown" },
    { locale: "zh-TW", alias: "滑輪下拉" },
  ]);
  await seedExercise("Dumbbell Curl", [
    { locale: "en", alias: "dumbbell curl" },
    { locale: "zh-TW", alias: "啞鈴彎舉" },
  ]);
  await seedExercise("Triceps Pushdown", [
    { locale: "en", alias: "triceps pushdown" },
    { locale: "zh-TW", alias: "三頭肌下壓" },
  ]);
  await seedExercise("Leg Press", [
    { locale: "en", alias: "leg press" },
    { locale: "zh-TW", alias: "腿推" },
  ]);
  await seedExercise("Leg Curl", [
    { locale: "en", alias: "leg curl" },
    { locale: "zh-TW", alias: "腿彎舉" },
  ]);
  await seedExercise("Calf Raise", [
    { locale: "en", alias: "calf raise" },
    { locale: "zh-TW", alias: "提踵" },
  ]);
}

async function seedExercise(
  defaultName: string,
  aliases: Array<{ locale: string; alias: string }>,
) {
  const exercise = await prisma.exercise.upsert({
    where: { slug: slugifyExerciseName(defaultName) },
    update: {},
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
      // Existing aliases belong to their current exercise, including user data.
      update: {},
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
    logger.info({ event: "seed.completed" }, "Development seed completed");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error(
      { event: "seed.failed", err: error },
      "Development seed failed",
    );
    await prisma.$disconnect();
    process.exit(1);
  });
