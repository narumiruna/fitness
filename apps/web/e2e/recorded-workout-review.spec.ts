import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";

const messages = {
  en: {
    skipped: "Skipped",
    overview: "Overview",
    totalSets: "Total sets",
    totalReps: "Total reps",
    totalVolume: "Total volume",
    exercises: "Exercises",
    editWorkout: "Edit workout",
    updateWorkout: "Update workout",
    title: "Title",
    updateSet: "Update set",
    save: "Save",
    addSet: "Add set",
    exercise: "Exercise",
    delete: "Delete",
    cancel: "Cancel",
    confirmDelete: "Confirm deletion",
  },
  "zh-TW": {
    skipped: "已略過",
    overview: "總覽",
    totalSets: "總組數",
    totalReps: "總次數",
    totalVolume: "總訓練量",
    exercises: "動作數",
    editWorkout: "編輯訓練",
    updateWorkout: "更新訓練",
    title: "標題",
    updateSet: "更新此組",
    save: "儲存",
    addSet: "新增一組",
    exercise: "動作",
    delete: "刪除",
    cancel: "取消",
    confirmDelete: "確認刪除",
  },
} as const;

async function submit(page: Page, button: Locator, action: string) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/actions/${action}`) &&
        response.request().method() === "POST",
    ),
    button.click(),
  ]);
  expect(response.status()).toBe(200);
}

async function validWeight(input: Locator, value: string) {
  await expect(input).toHaveValue(value);
  await expect(input).toHaveAttribute("step", "0.001");
  expect(
    await input.evaluate((element: HTMLInputElement) => ({
      valid: element.validity.valid,
      stepMismatch: element.validity.stepMismatch,
    })),
  ).toEqual({ valid: true, stepMismatch: false });
}

for (const locale of ["en", "zh-TW"] as const) {
  for (const width of [1440, 390]) {
    test(`recorded workout: clear text, precise weights and skipped rows (${locale}, ${width}px)`, async ({
      page,
      context,
    }) => {
      const labels = messages[locale];
      const key = `recorded-review-${randomUUID()}`;
      const user = await prisma.user.create({
        data: {
          username: key,
          passwordHash: await bcrypt.hash("review-password", 4),
        },
      });
      const exerciseIds: string[] = [];
      try {
        const performedExercise = await prisma.exercise.create({
          data: {
            slug: `${key}-performed`,
            defaultName: `${key} performed`,
            createdByUserId: user.id,
          },
        });
        exerciseIds.push(performedExercise.id);
        const skippedExercise = await prisma.exercise.create({
          data: {
            slug: `${key}-skipped`,
            defaultName: `${key} unperformed`,
            createdByUserId: user.id,
          },
        });
        exerciseIds.push(skippedExercise.id);
        const workout = await prisma.workout.create({
          data: {
            userId: user.id,
            date: new Date("2026-10-21T00:00:00"),
            title: "Review title",
            notes: "Review workout notes",
            sets: {
              create: [
                {
                  exerciseId: performedExercise.id,
                  order: 1,
                  weight: 50.25,
                  reps: 8,
                  notes: "Review set notes",
                },
                // Deliberately obvious placeholders must never be presented as actuals.
                {
                  exerciseId: skippedExercise.id,
                  order: 2,
                  weight: 999,
                  reps: 99,
                  completed: false,
                  actualsEntered: false,
                },
              ],
            },
          },
          include: { sets: { orderBy: { order: "asc" } } },
        });
        const performedId = workout.sets[0].id;
        const skippedId = workout.sets[1].id;
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/login");
        await page.locator('input[name="username"]').fill(key);
        await page.locator('input[name="password"]').fill("review-password");
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page).toHaveURL(/\/workouts$/);
        await context.addCookies([
          { name: "locale", value: locale, url: new URL(page.url()).origin },
        ]);
        await page.goto(`/workouts/${workout.id}`);

        const rows = page.locator("article.recorded-set");
        const performed = rows.nth(0);
        const skipped = rows.nth(1);
        const overview = page.getByRole("region", {
          name: labels.overview,
          exact: true,
        });
        await expect(rows).toHaveCount(2);
        await expect(
          skipped.getByText(labels.skipped, { exact: true }),
        ).toBeVisible();
        await expect(skipped).toContainText(skippedExercise.defaultName);
        await expect(skipped).not.toContainText(/\b999\b|\b99\b|kg/);
        await expect(
          skipped.locator(
            'input:not([type="hidden"]), textarea, select, [role="combobox"], summary',
          ),
        ).toHaveCount(0);
        await expect(
          skipped.getByRole("button", { name: labels.delete, exact: true }),
        ).toBeVisible();
        for (const [label, value] of [
          [labels.totalSets, "1"],
          [labels.totalReps, "8"],
          [labels.totalVolume, "402"],
          [labels.exercises, "1"],
        ]) {
          await expect(
            overview
              .locator(".rt-Text")
              .filter({ hasText: `${label}:` })
              .locator("strong"),
          ).toHaveText(value);
        }

        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await performed
          .locator("summary")
          .filter({ hasText: labels.updateSet })
          .click();
        const weight = performed.locator('input[name="weight"]');
        await validWeight(weight, "50.25");
        // An unchanged existing quarter-kilogram record must also be submittable.
        const save = performed.getByRole("button", {
          name: labels.updateSet,
          exact: true,
        });
        await submit(page, save, "updateWorkoutSetAction");
        await expect
          .poll(
            async () =>
              (
                await prisma.workoutSet.findUniqueOrThrow({
                  where: { id: performedId },
                })
              ).weight,
          )
          .toBe(50.25);
        await weight.fill("50.251");
        await validWeight(weight, "50.251");
        await performed.locator('[name="notes"]').fill("");
        // A failed request must retain the draft so a deliberate retry can save it.
        await page.route(
          "**/api/actions/updateWorkoutSetAction",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: "{}",
            }),
          { times: 1 },
        );
        await save.click();
        await expect(performed.getByRole("alert")).toBeVisible();
        await validWeight(weight, "50.251");
        await expect(performed.locator('[name="notes"]')).toHaveValue("");
        await submit(page, save, "updateWorkoutSetAction");
        await expect
          .poll(async () => {
            const set = await prisma.workoutSet.findUniqueOrThrow({
              where: { id: performedId },
            });
            return { weight: set.weight, notes: set.notes };
          })
          .toEqual({ weight: 50.251, notes: "" });

        const edit = page
          .getByText(labels.editWorkout, { exact: true })
          .locator("..");
        await edit.locator("summary").click();
        await edit.getByLabel(labels.title, { exact: true }).fill("");
        await edit.locator('[name="notes"]').fill("");
        await submit(
          page,
          edit.getByRole("button", { name: labels.updateWorkout, exact: true }),
          "updateWorkoutAction",
        );
        await expect
          .poll(async () => {
            const record = await prisma.workout.findUniqueOrThrow({
              where: { id: workout.id },
            });
            return { title: record.title, notes: record.notes };
          })
          .toEqual({ title: "", notes: "" });
        await page.reload();
        await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
          "Review title",
        );
        await edit.locator("summary").click();
        await expect(
          edit.getByLabel(labels.title, { exact: true }),
        ).toHaveValue("");
        await expect(edit.locator('[name="notes"]')).toHaveValue("");
        await performed
          .locator("summary")
          .filter({ hasText: labels.updateSet })
          .click();
        await validWeight(weight, "50.251");
        await expect(performed.locator('[name="notes"]')).toHaveValue("");
        await expect(
          skipped.getByText(labels.skipped, { exact: true }),
        ).toBeVisible();

        const add = page
          .getByRole("heading", { name: labels.addSet, exact: true })
          .locator("..")
          .locator("form");
        await add
          .getByRole("combobox", { name: labels.exercise, exact: true })
          .click();
        await page
          .getByRole("option", {
            name: performedExercise.defaultName,
            exact: true,
          })
          .click();
        await add.locator('input[name="weight"]').fill("0.001");
        await validWeight(add.locator('input[name="weight"]'), "0.001");
        await add.locator('input[name="reps"]').fill("1");
        await submit(
          page,
          add.getByRole("button", { name: labels.addSet, exact: true }),
          "createWorkoutSetAction",
        );
        await expect(rows).toHaveCount(3);
        const added = await prisma.workoutSet.findFirstOrThrow({
          where: { workoutId: workout.id, order: 3 },
        });
        expect({ weight: added.weight, completed: added.completed }).toEqual({
          weight: 0.001,
          completed: true,
        });
        await expect(
          overview
            .locator(".rt-Text")
            .filter({ hasText: `${labels.totalVolume}:` })
            .locator("strong"),
        ).toHaveText("402");
        await expect(
          overview
            .locator(".rt-Text")
            .filter({ hasText: `${labels.totalSets}:` })
            .locator("strong"),
        ).toHaveText("2");
        await expect(
          overview
            .locator(".rt-Text")
            .filter({ hasText: `${labels.totalReps}:` })
            .locator("strong"),
        ).toHaveText("9");
        await expect(
          overview
            .locator(".rt-Text")
            .filter({ hasText: `${labels.exercises}:` })
            .locator("strong"),
        ).toHaveText("1");
        const skippedRecord = await prisma.workoutSet.findUniqueOrThrow({
          where: { id: skippedId },
        });
        expect({
          completed: skippedRecord.completed,
          actualsEntered: skippedRecord.actualsEntered,
        }).toEqual({ completed: false, actualsEntered: false });
        await expect(
          skipped.locator(
            'input:not([type="hidden"]), textarea, select, [role="combobox"], summary',
          ),
        ).toHaveCount(0);

        await skipped
          .getByRole("button", { name: labels.delete, exact: true })
          .click();
        const dialog = page.getByRole("alertdialog", {
          name: labels.confirmDelete,
        });
        await dialog
          .getByRole("button", { name: labels.cancel, exact: true })
          .click();
        await expect(
          skipped.getByText(labels.skipped, { exact: true }),
        ).toBeVisible();
        await skipped
          .getByRole("button", { name: labels.delete, exact: true })
          .click();
        await submit(
          page,
          dialog.getByRole("button", { name: labels.delete, exact: true }),
          "deleteWorkoutSetAction",
        );
        await expect(rows).toHaveCount(2);
        expect(
          await prisma.workoutSet.findUnique({ where: { id: skippedId } }),
        ).toBeNull();
        await expect(
          overview
            .locator(".rt-Text")
            .filter({ hasText: `${labels.totalSets}:` })
            .locator("strong"),
        ).toHaveText("2");
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.exercise.deleteMany({
          where: { id: { in: exerciseIds } },
        });
      }
    });
  }
}

test.afterAll(async () => prisma.$disconnect());
