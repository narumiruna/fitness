import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";

const userIds: string[] = [];
const exerciseIds: string[] = [];

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.$disconnect();
});

test("the displayed progression suggestion can be accepted after completing a warm-up", async ({
  page,
  context,
}) => {
  const password = "progression-review";
  const user = await prisma.user.create({
    data: {
      username: `progression-${randomUUID()}`,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  userIds.push(user.id);
  const exercise = await prisma.exercise.create({
    data: { slug: randomUUID(), defaultName: "Progression review press" },
  });
  exerciseIds.push(exercise.id);
  const template = await prisma.workoutTemplate.create({
    data: {
      userId: user.id,
      title: "Progression review template",
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            type: "WARMUP",
            weight: 20,
            reps: 10,
          },
          { exerciseId: exercise.id, order: 2, weight: 80, reps: 8 },
        ],
      },
      rules: { create: { exerciseId: exercise.id, increment: 2.5 } },
    },
  });
  await prisma.workout.create({
    data: {
      userId: user.id,
      templateId: template.id,
      date: new Date(2020, 1, 29),
      state: "COMPLETED",
      sets: {
        create: {
          exerciseId: exercise.id,
          order: 2,
          weight: 80,
          reps: 8,
          targetWeight: 80,
          targetReps: 8,
          completed: true,
        },
      },
    },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      templateId: template.id,
      date: new Date(2020, 2, 1),
      state: "ACTIVE",
      resumedAt: new Date(),
      restSeconds: 0,
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            type: "WARMUP",
            weight: 0,
            reps: 1,
            targetWeight: 20,
            targetReps: 10,
            completed: false,
            actualsEntered: false,
          },
          {
            exerciseId: exercise.id,
            order: 2,
            type: "WORKING",
            weight: 0,
            reps: 1,
            targetWeight: 80,
            targetReps: 8,
            completed: false,
            actualsEntered: false,
          },
        ],
      },
    },
  });
  await context.addCookies([
    { name: "locale", value: "en", url: "http://localhost:8784" },
  ]);
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto(`/workouts/${workout.id}`);

  const warmup = page
    .locator("form")
    .filter({ has: page.locator('input[name="setId"]') })
    .filter({ has: page.locator('input[name="order"][value="1"]') });
  await warmup.getByLabel("Weight (kg)", { exact: true }).fill("20");
  await warmup.getByLabel("Reps", { exact: true }).fill("10");
  await warmup
    .getByRole("button", { name: "Complete set", exact: true })
    .click();
  await expect
    .poll(() =>
      prisma.workoutSet.count({
        where: { workoutId: workout.id, type: "WARMUP", completed: true },
      }),
    )
    .toBe(1);

  const suggestions = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^Progression suggestions$/ }),
  });
  await suggestions.locator(":scope > summary").click();
  await expect(suggestions).toContainText("82.5 kg (+2.5 kg)");
  await expect(suggestions.locator('input[name="version"]')).toHaveValue("1");
  await suggestions
    .getByRole("button", { name: "Accept suggestion", exact: true })
    .click();
  await expect
    .poll(() =>
      prisma.workoutSet
        .findFirstOrThrow({ where: { workoutId: workout.id, type: "WORKING" } })
        .then((set) => set.targetWeight),
    )
    .toBe(82.5);
  await expect(
    page.getByText("Target: 82.5 kg × 8", { exact: false }),
  ).toBeVisible();
  expect(
    await prisma.workoutSet.findFirstOrThrow({
      where: { workoutId: workout.id, type: "WARMUP" },
    }),
  ).toMatchObject({ targetWeight: 20, weight: 20, reps: 10, completed: true });
  expect(
    await prisma.workoutSet.findFirstOrThrow({
      where: { workoutId: workout.id, type: "WORKING" },
    }),
  ).toMatchObject({
    weight: 0,
    reps: 1,
    completed: false,
    actualsEntered: false,
  });
  expect(
    (await prisma.workout.findUniqueOrThrow({ where: { id: workout.id } }))
      .version,
  ).toBe(2);
});
