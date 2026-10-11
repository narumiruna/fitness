import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { formatDateKey, parseDateKey } from "../src/lib/calendar";
import { prisma } from "../src/lib/prisma";
import { serializeWorkouts } from "../src/lib/workout-csv";

const ids: string[] = [];
const exerciseIds: string[] = [];
test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.$disconnect();
});
async function choose(page: Page, trigger: Locator, name: string) {
  await trigger.click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function login(page: Page, name: string) {
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  if (await signOut.count()) {
    await signOut.click();
    await expect(page).toHaveURL(/\/login$/);
  }
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill("roadmap-test");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
}
test("nine roadmap workflows, owner isolation, keyboard access, failed saves, retries and mobile layout", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const user = await prisma.user.create({
    data: {
      username: `roadmap-${randomUUID()}`,
      passwordHash: await bcrypt.hash("roadmap-test", 4),
    },
  });
  ids.push(user.id);
  const other = await prisma.user.create({
    data: {
      username: `other-${randomUUID()}`,
      passwordHash: user.passwordHash,
    },
  });
  ids.push(other.id);
  const exercise = await prisma.exercise.create({
    data: {
      slug: randomUUID(),
      defaultName: "Roadmap Press",
      createdByUserId: user.id,
    },
  });
  exerciseIds.push(exercise.id);
  const noHistory = await prisma.exercise.create({
    data: {
      slug: randomUUID(),
      defaultName: "Roadmap Row",
      createdByUserId: other.id,
    },
  });
  exerciseIds.push(noHistory.id);
  const today = formatDateKey(new Date());
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const yesterday = formatDateKey(previous);
  await prisma.workout.create({
    data: {
      userId: user.id,
      date: previous,
      sets: {
        create: [
          { exerciseId: exercise.id, order: 1, weight: 80, reps: 8 },
          { exerciseId: exercise.id, order: 2, weight: 85, reps: 5 },
        ],
      },
    },
  });
  const w = await prisma.workout.create({
    data: {
      userId: user.id,
      date: parseDateKey(today) as Date,
      title: "Roadmap entry",
    },
  });
  await login(page, user.username);
  await page.goto(`/workouts/${w.id}`);
  const add = page.locator("form").filter({
    has: page.getByRole("button", { name: "Add set", exact: true }),
  });
  await expect(
    add.getByText("Previous session:", { exact: false }),
  ).toBeVisible();
  await add.getByLabel("Weight (kg)", { exact: true }).fill("1");
  await add.getByLabel("Reps", { exact: true }).fill("1");
  await add
    .getByRole("button", { name: "Copy weight and reps" })
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await expect(add.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "80",
  );
  await choose(
    page,
    add.getByRole("combobox", { name: "Exercise", exact: true }),
    "Roadmap Row",
  );
  await expect(
    add.getByText("No earlier completed sets", { exact: false }),
  ).toBeVisible();
  await expect(add.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "80",
  );
  await choose(
    page,
    add.getByRole("combobox", { name: "Exercise", exact: true }),
    "Roadmap Press",
  );
  await add.getByLabel("Reps in reserve (RIR)").fill("0.5");
  await add.getByRole("button", { name: "Add set", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workoutSet.count({
        where: { workoutId: w.id, rir: 0.5, type: "WORKING" },
      }),
    )
    .toBe(1);
  const entryRow = page.locator(".desktop-table tbody tr").first();
  await choose(
    page,
    entryRow.getByRole("combobox", { name: "Set type", exact: true }),
    "Warm-up",
  );
  await entryRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workoutSet
        .findFirst({ where: { workoutId: w.id } })
        .then((set) => set?.type),
    )
    .toBe("WARMUP");
  await page.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`${w.id}$`));
  const repeatedId = page.url().split("/").at(-1);
  const repeated = await prisma.workoutSet.findFirstOrThrow({
    where: { workoutId: repeatedId },
  });
  expect(repeated.type).toBe("WARMUP");
  expect(repeated.rir).toBe(null);
  await page.goto(`/workouts/${w.id}`);
  await choose(
    page,
    entryRow.getByRole("combobox", { name: "Set type", exact: true }),
    "Working",
  );
  await entryRow.getByLabel("Reps in reserve (RIR)").fill("");
  await entryRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workoutSet
        .findFirst({ where: { workoutId: w.id } })
        .then((set) => ({ type: set?.type, rir: set?.rir })),
    )
    .toEqual({ type: "WORKING", rir: null });
  const saveTemplate = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save as template", exact: true }),
  });
  await saveTemplate.getByLabel("Template name").fill("Roadmap routine");
  await saveTemplate
    .getByRole("button", { name: "Save as template", exact: true })
    .click();
  await expect
    .poll(() => prisma.workoutTemplate.count({ where: { userId: user.id } }))
    .toBe(1);
  const template = await prisma.workoutTemplate.findFirstOrThrow({
    where: { userId: user.id },
  });
  await prisma.workoutTemplateSet.create({
    data: {
      templateId: template.id,
      exerciseId: exercise.id,
      order: 2,
      weight: 20,
      reps: 5,
      type: "WARMUP",
    },
  });
  const progressionSource = await prisma.workout.create({
    data: {
      userId: user.id,
      date: parseDateKey(yesterday) as Date,
      templateId: template.id,
      templateTitle: template.title,
      sets: {
        create: {
          exerciseId: exercise.id,
          order: 1,
          weight: 80,
          reps: 8,
          targetWeight: 80,
          targetReps: 8,
        },
      },
    },
  });
  await page.goto("/workouts");
  const rule = page
    .locator("form")
    .filter({ has: page.locator('input[name="templateId"]') })
    .filter({ has: page.getByLabel("Disable progression") });
  await rule.getByLabel("Disable progression").uncheck();
  await rule.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.progressionRule.count({ where: { templateId: template.id } }),
    )
    .toBe(1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const scheduleForm = page.locator("form").filter({
    has: page.locator(`input[name="weekday"][value="${tomorrow.getDay()}"]`),
  });
  await choose(page, scheduleForm.getByRole("combobox"), "Roadmap routine");
  await scheduleForm.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.templateSchedule.count({
        where: { userId: user.id, effectiveTo: null },
      }),
    )
    .toBe(1);
  const start = page.locator("form").filter({
    has: page.locator(`input[name="sourceId"][value="${template.id}"]`),
  });
  await start
    .getByRole("button", { name: "Start training", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts\/[^/]+$/);
  const activeId = page.url().split("/").at(-1) as string;
  await expect(
    page.getByText("All prescribed working sets met their targets.", {
      exact: false,
    }),
  ).toBeVisible();
  await prisma.workoutSet.updateMany({
    where: { workoutId: progressionSource.id },
    data: { reps: 7 },
  });
  await page
    .getByRole("button", { name: "Accept suggestion", exact: true })
    .click();
  await expect(page.getByText("Not saved.", { exact: false })).toBeVisible();
  expect(
    (
      await prisma.workoutSet.findFirstOrThrow({
        where: { workoutId: activeId, type: "WORKING" },
      })
    ).targetWeight,
  ).toBe(80);
  await prisma.workoutSet.updateMany({
    where: { workoutId: progressionSource.id },
    data: { reps: 8 },
  });
  await page
    .getByRole("button", { name: "Accept suggestion", exact: true })
    .click();
  await expect
    .poll(() =>
      prisma.workoutSet
        .findFirst({ where: { workoutId: activeId, type: "WORKING" } })
        .then((s) => s?.targetWeight),
    )
    .toBe(82.5);
  const actual = page
    .locator("form")
    .filter({ has: page.locator('input[name="weight"]') })
    .first();
  await actual.getByLabel("Weight (kg)", { exact: true }).fill("84");
  await actual
    .locator('input[name="version"]')
    .evaluate((element) => ((element as HTMLInputElement).value = "-1"));
  await actual.getByRole("button", { name: "Save", exact: true }).click();
  await expect(actual.getByText("Not saved.", { exact: false })).toBeVisible();
  await expect(actual.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "84",
  );
  const confirmedVersion = (
    await prisma.workout.findUniqueOrThrow({ where: { id: activeId } })
  ).version;
  await actual
    .locator('input[name="version"]')
    .evaluate(
      (element, value) => ((element as HTMLInputElement).value = String(value)),
      confirmedVersion,
    );
  await actual.getByLabel("Weight (kg)", { exact: true }).fill("82.5");
  await actual.getByLabel("Reps", { exact: true }).fill("8");
  await actual.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workoutSet
        .findFirst({ where: { workoutId: activeId, type: "WORKING" } })
        .then((s) => s?.weight),
    )
    .toBe(82.5);
  await page
    .getByRole("button", { name: "Complete set", exact: true })
    .first()
    .click();
  await expect
    .poll(() =>
      prisma.workoutSet.count({
        where: { workoutId: activeId, completed: true },
      }),
    )
    .toBe(1);
  await page.reload();
  await expect(page.getByText("82.5 kg × 8", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Rest remaining (seconds): 0")).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("Not saved.", { exact: false })).toBeVisible();
  await page.getByLabel("I confirm finishing with skipped sets.").check();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workout
        .findUnique({ where: { id: activeId } })
        .then((w) => w?.state),
    )
    .toBe("COMPLETED");
  await page.goto("/calendar");
  const occurrence = page
    .locator("form")
    .filter({ has: page.locator('input[name="scheduled"][value="true"]') })
    .filter({
      has: page.locator(
        `input[name="date"][value="${formatDateKey(tomorrow)}"]`,
      ),
    });
  await occurrence
    .getByRole("button", { name: "Start training", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts\/[^/]+$/);
  const scheduledId = page.url().split("/").at(-1) as string;
  await expect
    .poll(() =>
      prisma.workout.count({
        where: {
          id: scheduledId,
          userId: user.id,
          plannedDate: parseDateKey(formatDateKey(tomorrow)),
        },
      }),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Abandon", exact: true }).click();
  await expect
    .poll(() =>
      prisma.workout
        .findUnique({ where: { id: scheduledId } })
        .then((w) => w?.state),
    )
    .toBe("ABANDONED");
  await page.goto("/workouts");
  const removeSchedule = page.locator("form").filter({
    has: page.locator(`input[name="weekday"][value="${tomorrow.getDay()}"]`),
  });
  await choose(page, removeSchedule.getByRole("combobox"), "Delete");
  await removeSchedule
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect
    .poll(() =>
      prisma.templateSchedule.count({
        where: { userId: user.id, effectiveTo: null },
      }),
    )
    .toBe(0);
  expect(
    (await prisma.workout.findUniqueOrThrow({ where: { id: scheduledId } }))
      .templateTitle,
  ).toBe("Roadmap routine");
  await page.goto(`/exercises/${exercise.id}`);
  const metadata = page
    .locator("form")
    .filter({ has: page.locator('input[name="exerciseId"]') });
  await metadata
    .getByRole("group", { name: "Primary muscles" })
    .getByLabel("Chest", { exact: true })
    .check();
  await metadata
    .getByRole("group", { name: "Secondary muscles" })
    .getByLabel("Shoulders", { exact: true })
    .check();
  await metadata.getByLabel("Barbell", { exact: true }).check();
  await metadata.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.exerciseMuscle.count({ where: { exerciseId: exercise.id } }),
    )
    .toBe(2);
  await page.goto("/exercises?muscle=chest&equipment=barbell");
  await expect(
    page.getByRole("link", { name: "Roadmap Press", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Roadmap Row", exact: true }),
  ).toHaveCount(0);
  await page.goto("/stats");
  await expect(
    page.getByRole("heading", { name: "Training consistency", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label*="training days" i]').first(),
  ).toBeVisible();
  await expect(
    page.getByText("Primary sets and secondary involvement", { exact: false }),
  ).toBeVisible();
  await page.locator('input[name="year"]').fill("2024");
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="year"]') })
    .getByRole("button", { name: "Apply filters" })
    .click();
  await expect(
    page.locator('section[aria-label="Training days"] [tabindex="0"]'),
  ).toHaveCount(366);
  const leapDay = page.getByLabel("2024-02-29: 0 Training days", {
    exact: true,
  });
  await page.waitForURL("**/stats?year=2024");
  await expect(async () => {
    await leapDay.focus();
    await expect(leapDay).toBeFocused();
  }).toPass();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("2024-03-01: 0 Training days", { exact: true }),
  ).toBeFocused();
  await page.goto("/measurements");
  await expect(page.getByText("No measurements yet.")).toBeVisible();
  const measurement = page
    .locator("form")
    .filter({ has: page.locator('input[name="waist"]') })
    .first();
  await measurement.getByLabel("Weight (kg)", { exact: true }).fill("75");
  await measurement.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => prisma.bodyMeasurement.count({ where: { userId: user.id } }))
    .toBe(1);
  const goal = page
    .locator("form")
    .filter({ has: page.getByLabel("Target weight (kg)") });
  await goal.getByLabel("Target weight (kg)").fill("70");
  await goal.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.bodyGoal
        .findUnique({ where: { userId: user.id } })
        .then((g) => g?.weight),
    )
    .toBe(70);
  await expect(
    page.locator("svg").getByText("Target weight (kg): 70", { exact: true }),
  ).toBeVisible();
  await goal.getByLabel("Target weight (kg)").fill("");
  await goal.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      prisma.bodyGoal
        .findUnique({ where: { userId: user.id } })
        .then((g) => g?.weight),
    )
    .toBe(null);
  await page.getByText("Edit measurement", { exact: true }).click();
  const editMeasurement = page.locator("details form");
  await editMeasurement.getByLabel("Weight (kg)", { exact: true }).fill("74");
  await editMeasurement.getByLabel("Waist (cm)", { exact: true }).fill("90");
  await editMeasurement
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect
    .poll(() =>
      prisma.bodyMeasurement
        .findFirst({ where: { userId: user.id } })
        .then((r) => r?.waist),
    )
    .toBe(90);
  await expect(editMeasurement).not.toBeVisible();
  await page.getByText("Edit measurement", { exact: true }).click();
  await editMeasurement.getByLabel("Weight (kg)", { exact: true }).fill("501");
  await editMeasurement.evaluate(
    (element) => ((element as HTMLFormElement).noValidate = true),
  );
  await editMeasurement
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    editMeasurement.getByText("Not saved.", { exact: false }),
  ).toBeVisible();
  await expect(
    editMeasurement.getByLabel("Weight (kg)", { exact: true }),
  ).toHaveValue("501");
  expect(
    (
      await prisma.bodyMeasurement.findFirstOrThrow({
        where: { userId: user.id },
      })
    ).weight,
  ).toBe(74);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect
    .poll(() => prisma.bodyMeasurement.count({ where: { userId: user.id } }))
    .toBe(0);
  await page.goto("/data");
  const download = await context.request.get("/data/export");
  expect(download.ok()).toBe(true);
  const csv = await download.text();
  expect(csv).toContain("weight_kg");
  expect(csv).not.toContain(user.passwordHash);
  const before = await prisma.workout.count({ where: { userId: user.id } });
  await page.getByLabel("CSV file").setInputFiles({
    name: "roundtrip.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toBeVisible();
  expect(await prisma.workout.count({ where: { userId: user.id } })).toBe(
    before,
  );
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByText("Imported: 0.", { exact: false })).toBeVisible();
  expect(await prisma.workout.count({ where: { userId: user.id } })).toBe(
    before,
  );
  await page.getByLabel("CSV file").setInputFiles({
    name: "cancel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toHaveCount(0);
  expect(await prisma.workout.count({ where: { userId: user.id } })).toBe(
    before,
  );
  await page.getByLabel("CSV file").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("wrong,header"),
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByText("Invalid app CSV.", { exact: false }),
  ).toBeVisible();
  const unknown = serializeWorkouts([
    {
      key: "unknown",
      date: today,
      title: "=formula",
      notes: null,
      state: "COMPLETED",
      activeSeconds: 0,
      templateTitle: null,
      sets: [
        {
          order: 1,
          exercise: "Roadmap New",
          weight: 50,
          reps: 5,
          notes: null,
          type: "WORKING",
          rir: null,
          completed: true,
          targetWeight: null,
          targetReps: null,
        },
      ],
    },
  ]);
  await page.getByLabel("CSV file").setInputFiles({
    name: "unknown.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(unknown),
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Exercise mapping: Roadmap New" }),
  ).toBeVisible();
  await choose(
    page,
    page.getByRole("combobox", { name: "Exercise mapping: Roadmap New" }),
    "Create unknown exercises",
  );
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByText("Imported: 1.", { exact: false })).toBeVisible();
  const created = await prisma.exercise.findFirstOrThrow({
    where: { createdByUserId: user.id, defaultName: "Roadmap New" },
  });
  exerciseIds.push(created.id);
  for (const route of [
    "/measurements",
    "/data",
    "/stats",
    "/workouts",
    `/exercises/${exercise.id}`,
  ]) {
    await page.goto(route);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .exclude("nextjs-portal")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations, route).toEqual([]);
  }
  await login(page, other.username);
  await page.goto("/measurements");
  await expect(page.getByText("No measurements yet.")).toBeVisible();
  await page.goto(`/exercises/${exercise.id}`);
  await expect(page.locator('form input[name="exerciseId"]')).toHaveCount(0);
  await page.goto(`/exercises/${noHistory.id}`);
  const foreignForm = page
    .locator("form")
    .filter({ has: page.locator('input[name="exerciseId"]') });
  await foreignForm
    .getByRole("group", { name: "Primary muscles" })
    .getByLabel("Back", { exact: true })
    .check();
  await foreignForm
    .locator('input[name="exerciseId"]')
    .evaluate(
      (element, value) => ((element as HTMLInputElement).value = value),
      exercise.id,
    );
  await foreignForm.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Not saved.", { exact: false })).toBeVisible();
  expect(
    await prisma.exerciseMuscle.count({ where: { exerciseId: exercise.id } }),
  ).toBe(2);
  const ownExport = await context.request.get("/data/export");
  expect(await ownExport.text()).not.toContain("Roadmap entry");
});
