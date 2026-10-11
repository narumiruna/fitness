import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const userIds: string[] = [];
const exerciseIds: string[] = [];

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("edit-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
}

test.afterAll(async () => {
  try {
    // Deleting users also removes their workouts, sets, and sessions.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

test("exercise renaming preserves records and checks duplicates and permissions", async ({
  page,
}) => {
  const passwordHash = await bcrypt.hash("edit-password", 4);
  const owner = await prisma.user.create({
    data: { username: "edit-owner", passwordHash },
  });
  userIds.push(owner.id);
  const admin = await prisma.user.create({
    data: { username: "edit-admin", passwordHash, role: "ADMIN" },
  });
  userIds.push(admin.id);
  const exercise = await prisma.exercise.create({
    data: {
      slug: "edit-original",
      defaultName: "Edit Original",
      createdByUserId: owner.id,
      names: {
        create: { locale: "en", name: "Edit Original", isPrimary: true },
      },
      aliases: {
        create: {
          locale: "en",
          alias: "Edit Original",
          normalizedAlias: "edit original",
        },
      },
    },
  });
  exerciseIds.push(exercise.id);
  const protectedExercise = await prisma.exercise.create({
    data: {
      slug: "edit-protected",
      defaultName: "Edit Protected",
    },
  });
  exerciseIds.push(protectedExercise.id);
  const workout = await prisma.workout.create({
    data: {
      userId: owner.id,
      date: new Date(),
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 20, reps: 5 },
      },
    },
  });
  await login(page, owner.username);
  await page.goto("/exercises");
  await page
    .locator(".exercise-row")
    .filter({ hasText: "Edit Original" })
    .getByRole("link", { name: "Edit exercise", exact: true })
    .click();
  const form = page.locator("#edit-exercise");
  await expect(form.getByLabel("Default name")).toHaveValue("Edit Original");
  await form.getByLabel("Default name").fill("  Edit Renamed  ");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Edit Renamed",
  );
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(form.getByLabel("Default name")).toHaveValue("Edit Renamed");
  const saved = await prisma.exercise.findUniqueOrThrow({
    where: { id: exercise.id },
    include: { names: true, aliases: true },
  });
  expect(saved.slug).toBe("edit-original");
  // Seed and legacy import must still find the same record by its original slug.
  expect(
    await prisma.exercise.findUnique({ where: { slug: "edit-original" } }),
  ).toMatchObject({ id: exercise.id, defaultName: "Edit Renamed" });
  expect(
    saved.names.filter((name) => name.isPrimary).map((name) => name.name),
  ).toEqual(["Edit Renamed"]);
  expect(saved.aliases.map((alias) => alias.normalizedAlias).sort()).toEqual([
    "edit original",
    "edit renamed",
  ]);
  expect(
    await prisma.workoutSet.findFirst({ where: { workoutId: workout.id } }),
  ).toMatchObject({ exerciseId: exercise.id, weight: 20, reps: 5 });
  await page.goto("/exercises?q=Edit%20Original");
  await expect(page.locator(".exercise-row")).toContainText("Edit Renamed");
  await page.goto(`/exercises/${exercise.id}`);
  await form.getByLabel("Default name").fill("Edit Protected");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "This exercise name already exists.",
  );
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Edit Renamed", slug: "edit-original" });
  // Alias-less imported exercises must also reserve their visible names.
  await prisma.exerciseAlias.create({
    data: {
      exerciseId: protectedExercise.id,
      locale: "en",
      alias: "Reserved Alias",
      normalizedAlias: "reserved alias",
    },
  });
  await form.getByLabel("Default name").fill("Reserved Alias");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "This exercise name already exists.",
  );
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Edit Renamed" });
  expect(
    await prisma.exerciseName.count({
      where: { exerciseId: exercise.id, name: "Reserved Alias" },
    }),
  ).toBe(0);
  await page.goto(`/exercises/${protectedExercise.id}`);
  await expect(page.locator("#edit-exercise")).toHaveCount(0);
  await page.goto(`/exercises/${exercise.id}`);
  await form
    .locator('input[name="exerciseId"]')
    .evaluate((input: HTMLInputElement, id) => {
      input.value = id;
    }, protectedExercise.id);
  await form.getByLabel("Default name").fill("Unauthorized rename");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  expect(
    await prisma.exercise.findUnique({ where: { id: protectedExercise.id } }),
  ).toMatchObject({ defaultName: "Edit Protected" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "edit-admin");
  await page.goto(`/exercises/${protectedExercise.id}`);
  await form.getByLabel("Default name").fill("Admin Renamed");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Admin Renamed",
  );
});
