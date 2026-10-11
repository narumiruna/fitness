import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { stringifyWorkoutCsv } from "../scripts/workout-csv";
import { slugifyExerciseName } from "../src/lib/exercises";
import { prisma } from "../src/lib/prisma";

const runFile = promisify(execFile);
const userIds: string[] = [];
const exerciseIds: string[] = [];
test.afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

test("seed and legacy import reruns preserve renamed exercise identity and primary name", async ({
  page,
}) => {
  const admin = await prisma.user.create({
    data: {
      username: "admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("admin", 4),
    },
  });
  userIds.push(admin.id);
  const seededNames = [
    "Deadlift",
    "Squat",
    "Bench Press",
    "Overhead Press",
    "Barbell Row",
    "Pull-up",
    "Lat Pulldown",
    "Dumbbell Curl",
    "Triceps Pushdown",
    "Leg Press",
    "Leg Curl",
    "Calf Raise",
  ];
  for (const name of seededNames) {
    const exercise = await prisma.exercise.create({
      data: {
        slug: slugifyExerciseName(name),
        defaultName: name,
        names: { create: { locale: "en", name, isPrimary: true } },
      },
    });
    exerciseIds.push(exercise.id);
  }
  const existingRow = await prisma.exercise.create({
    data: {
      slug: "barbell-bent-over-row",
      defaultName: "Barbell Bent-Over Row",
      aliases: {
        create: {
          locale: "en",
          alias: "Barbell Row",
          normalizedAlias: "barbell row",
        },
      },
    },
  });
  exerciseIds.push(existingRow.id);
  const squat = await prisma.exercise.findUniqueOrThrow({
    where: { slug: "squat" },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: admin.id,
      date: new Date("2001-01-01T00:00:00"),
      sets: { create: { exerciseId: squat.id, order: 1, weight: 20, reps: 5 } },
    },
  });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto(`/exercises/${squat.id}`);
  const form = page.locator("#edit-exercise");
  await form.getByLabel("Default name").fill("Back Squat");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Back Squat",
  );

  const assertNaming = async () => {
    const exercise = await prisma.exercise.findUniqueOrThrow({
      where: { slug: "squat" },
      include: { names: true },
    });
    expect(exercise).toMatchObject({ id: squat.id, defaultName: "Back Squat" });
    expect(
      exercise.names.filter((name) => name.isPrimary).map((name) => name.name),
    ).toEqual(["Back Squat"]);
    expect(
      await prisma.workoutSet.findFirst({ where: { workoutId: workout.id } }),
    ).toMatchObject({ exerciseId: squat.id });
    expect(await prisma.exercise.count()).toBe(seededNames.length + 1);
    expect(
      await prisma.exerciseAlias.findUniqueOrThrow({
        where: {
          locale_normalizedAlias: {
            locale: "en",
            normalizedAlias: "barbell row",
          },
        },
      }),
    ).toMatchObject({ exerciseId: existingRow.id, alias: "Barbell Row" });
    const pullUp = await prisma.exercise.findUniqueOrThrow({
      where: { slug: "pull-up" },
      include: { aliases: true },
    });
    expect(
      pullUp.aliases
        .filter((alias) => alias.locale === "en")
        .map((alias) => alias.normalizedAlias)
        .sort(),
    ).toEqual(["pull up", "pull-up"]);
  };
  await runFile(process.execPath, [
    "--import",
    "tsx",
    resolve("prisma/seed.ts"),
  ]);
  await assertNaming();
  await runFile(process.execPath, [
    "--import",
    "tsx",
    resolve("prisma/seed.ts"),
  ]);
  await assertNaming();
  await page.goto("/exercises?q=Pull%20Up");
  await expect(
    page.getByRole("link", { name: "Pull-up", exact: true }),
  ).toBeVisible();

  // Run the real legacy importer without reading or changing repository data/.
  const directory = await mkdtemp(join(tmpdir(), "fitness-exercise-import-"));
  try {
    await mkdir(join(directory, "data"));
    await writeFile(
      join(directory, "data/workouts.csv"),
      stringifyWorkoutCsv([
        {
          date: "2001-01-02",
          sourceFile: "fixture.md",
          rowType: "set",
          exerciseNameZh: "Squat fixture",
          exerciseNameEn: "Squat",
          order: 1,
          weight: 25,
          reps: 5,
          note: "",
          rawLine: "fixture",
        },
      ]),
    );
    await runFile(
      process.execPath,
      [
        "--import",
        resolve("node_modules/tsx/dist/loader.mjs"),
        resolve("scripts/import-workouts-csv.ts"),
      ],
      {
        cwd: directory,
        env: { ...process.env, TSX_TSCONFIG_PATH: resolve("tsconfig.json") },
      },
    );
    await assertNaming();
    expect(
      await prisma.workoutSet.count({ where: { exerciseId: squat.id } }),
    ).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
