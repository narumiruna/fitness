import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { formatDateKey } from "../src/lib/calendar";
import { prisma } from "../src/lib/prisma";

let userId: string;
let exerciseId: string;
let workoutId: string;
let username: string;

test.beforeEach(async ({ page }) => {
  username = `ux-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("ux-password", 4) },
  });
  userId = user.id;
  const exercise = await prisma.exercise.create({
    data: {
      slug: randomUUID(),
      defaultName: "UX Press",
      createdByUserId: userId,
    },
  });
  exerciseId = exercise.id;
  const template = await prisma.workoutTemplate.create({
    data: {
      userId,
      title: "UX template",
      sets: {
        create: [
          { exerciseId, order: 1, weight: 80, reps: 8 },
          { exerciseId, order: 2, weight: 80, reps: 8 },
        ],
      },
      rules: { create: { exerciseId, increment: 2.5 } },
    },
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await prisma.workout.create({
    data: {
      userId,
      templateId: template.id,
      date: yesterday,
      sets: {
        create: [1, 2].map((order) => ({
          exerciseId,
          order,
          weight: 80,
          reps: 8,
          targetWeight: 80,
          targetReps: 8,
        })),
      },
    },
  });
  const workout = await prisma.workout.create({
    data: {
      userId,
      templateId: template.id,
      title: "UX live",
      date: new Date(),
      state: "ACTIVE",
      resumedAt: new Date(),
      sets: {
        create: [1, 2].map((order) => ({
          exerciseId,
          order,
          weight: 0,
          reps: 1,
          targetWeight: 80,
          targetReps: 8,
          completed: false,
          actualsEntered: false,
        })),
      },
    },
  });
  workoutId = workout.id;
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("ux-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto(`/workouts/${workoutId}`);
});
test.afterEach(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.exercise.delete({ where: { id: exerciseId } });
});
test.afterAll(async () => prisma.$disconnect());

function editors(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.locator('input[name="setId"]') });
}
async function fillDraft(form: Locator) {
  await form.getByLabel("Weight (kg)", { exact: true }).fill("73");
  await form.getByLabel("Reps", { exact: true }).fill("7");
  await form.getByLabel("Reps in reserve (RIR)", { exact: true }).fill("1.5");
  await form.getByLabel("Notes", { exact: true }).fill("Unsaved draft");
}
async function expectDraft(form: Locator) {
  await expect(form.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "73",
  );
  await expect(form.getByLabel("Reps", { exact: true })).toHaveValue("7");
  await expect(
    form.getByLabel("Reps in reserve (RIR)", { exact: true }),
  ).toHaveValue("1.5");
  await expect(form.getByLabel("Notes", { exact: true })).toHaveValue(
    "Unsaved draft",
  );
}

for (const operation of [
  "Save",
  "Complete set",
  "Pause",
  "Resume",
  "Accept suggestion",
]) {
  test(`draft survives ${operation}`, async ({ page }) => {
    if (operation === "Resume") {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Resume", exact: true }),
      ).toBeVisible();
    }
    await fillDraft(editors(page).nth(1));
    const previous = (
      await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } })
    ).version;
    if (operation === "Save" || operation === "Complete set") {
      await fillDraft(editors(page).first());
      await editors(page)
        .first()
        .getByRole("button", { name: operation, exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: operation, exact: true }).click();
    }
    await expect
      .poll(
        async () =>
          (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
            .version,
      )
      .toBeGreaterThan(previous);
    // Wait for revalidation, not only the database write.
    await expect(
      editors(page).nth(1).locator('input[name="version"]'),
    ).toHaveValue(String(previous + 1));
    await expectDraft(editors(page).nth(1));
  });
}

test("sequential saves, conflict recovery, validation, and intentional clearing retain actuals", async ({
  page,
}) => {
  const first = editors(page).first();
  const second = editors(page).nth(1);
  await fillDraft(first);
  await fillDraft(second);
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText("Saved.");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second.getByRole("status")).toHaveText("Saved.");
  await expect
    .poll(
      async () =>
        (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
          .version,
    )
    .toBe(2);

  await prisma.workout.update({
    where: { id: workoutId },
    data: { version: { increment: 1 } },
  });
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("status")).toContainText("The session changed.");
  await expectDraft(first);
  await first.getByRole("button", { name: "Load latest session" }).click();
  await expect(first.locator('input[name="version"]')).toHaveValue("3");
  await expectDraft(first);
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText("Saved.");

  await first.evaluate((el) => {
    (el as HTMLFormElement).noValidate = true;
  });
  await first.getByLabel("Reps", { exact: true }).fill("1001");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByRole("status")).toContainText(
    "Check weight, reps, RIR, and notes",
  );
  await expect(first.getByLabel("Reps", { exact: true })).toHaveValue("1001");
  await first.getByLabel("Weight (kg)", { exact: true }).fill("0");
  await first.getByLabel("Reps", { exact: true }).fill("1");
  await first.getByLabel("Reps in reserve (RIR)", { exact: true }).fill("");
  await first.getByLabel("Notes", { exact: true }).fill("");
  await first
    .getByRole("button", { name: "Complete set", exact: true })
    .click();
  await expect(first.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(first.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "0",
  );
  await expect(first.getByLabel("Reps", { exact: true })).toHaveValue("1");
  await expect(
    first.getByLabel("Reps in reserve (RIR)", { exact: true }),
  ).toHaveValue("");
  await expect(first.getByLabel("Notes", { exact: true })).toHaveValue("");
  const set = await prisma.workoutSet.findFirstOrThrow({
    where: { workoutId, order: 1 },
  });
  expect(set).toMatchObject({
    weight: 0,
    reps: 1,
    rir: null,
    notes: "",
    completed: true,
  });
});

test("finish confirmation cancels safely, rejects changed state, and explicitly skips sets", async ({
  page,
}) => {
  await fillDraft(editors(page).first());
  const finish = page.getByRole("button", { name: "Finish", exact: true });
  await finish.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("2 unfinished sets skipped");
  await dialog.locator('input[name="partial"]').evaluate((el) => {
    (el as HTMLInputElement).value = "";
  });
  await dialog
    .getByRole("button", { name: "Finish with skipped sets", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Some sets are unfinished",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(finish).toBeFocused();
  await expectDraft(editors(page).first());
  expect(
    (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
      .state,
  ).toBe("ACTIVE");

  await finish.click();
  await prisma.workout.update({
    where: { id: workoutId },
    data: { version: { increment: 1 } },
  });
  await dialog
    .getByRole("button", { name: "Finish with skipped sets", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "The session changed.",
  );
  await dialog.getByRole("button", { name: "Load latest session" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectDraft(editors(page).first());
  await finish.click();
  await dialog
    .getByRole("button", { name: "Finish with skipped sets", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
          .state,
    )
    .toBe("COMPLETED");
  await expect(dialog).toHaveCount(0);
});

test("normal finish requires no skipped-set dialog", async ({ page }) => {
  await prisma.workoutSet.updateMany({
    where: { workoutId },
    data: { completed: true, actualsEntered: true, weight: 80, reps: 8 },
  });
  await page.reload();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
          .state,
    )
    .toBe("COMPLETED");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("abandon confirmation supports keyboard cancellation, failure recovery, and one mutation", async ({
  page,
}, info) => {
  await fillDraft(editors(page).first());
  const abandon = page.getByRole("button", { name: "Abandon", exact: true });
  await abandon.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Recorded data will remain");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(abandon).toBeFocused();
  await expectDraft(editors(page).first());
  await abandon.click();
  await expect(
    new AxeBuilder({ page })
      .exclude("nextjs-portal")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
      .then((result) => result.violations),
  ).resolves.toEqual([]);
  await page.screenshot({
    path: info.outputPath("abandon-dialog.png"),
    caret: "initial",
  });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/workouts/${workoutId}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.abort("failed");
  });
  await dialog.getByRole("button", { name: "Abandon", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Abandon", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("status")).toContainText(
    "Not saved. Check the input",
  );
  await page.unroute(`**/workouts/${workoutId}`);
  await prisma.workout.update({
    where: { id: workoutId },
    data: { version: { increment: 1 } },
  });
  await dialog.getByRole("button", { name: "Abandon", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "The session changed.",
  );
  await dialog.getByRole("button", { name: "Load latest session" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectDraft(editors(page).first());
  await abandon.click();
  await dialog.getByRole("button", { name: "Abandon", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
          .state,
    )
    .toBe("ABANDONED");
  expect(
    (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
      .version,
  ).toBe(2);
  expect(await prisma.workoutSet.count({ where: { workoutId } })).toBe(2);
});

test("unavailable sets return a safe specific outcome", async ({ page }) => {
  const form = editors(page).first();
  await fillDraft(form);
  await form.locator('input[name="setId"]').evaluate((el) => {
    (el as HTMLInputElement).value = "missing-set";
  });
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("no longer available");
  await expectDraft(form);
  expect(
    (await prisma.workout.findUniqueOrThrow({ where: { id: workoutId } }))
      .version,
  ).toBe(0);
});

test("history distinguishes states, progress, partial metrics, filters, pagination, and continue links", async ({
  page,
}, info) => {
  await prisma.workoutSet.updateMany({
    where: { workoutId, order: 1 },
    data: { completed: true, actualsEntered: true, weight: 70, reps: 5 },
  });
  for (const state of ["PAUSED", "ABANDONED", "COMPLETED"]) {
    await prisma.workout.create({
      data: {
        userId,
        state,
        title: `UX ${state}`,
        date: new Date(),
        sets: {
          create: [1, 2].map((order) => ({
            exerciseId,
            order,
            weight: 60,
            reps: 5,
            completed: order === 1,
            targetWeight: 80,
            targetReps: 8,
          })),
        },
      },
    });
  }
  await prisma.workout.create({
    data: { userId, state: "ACTIVE", title: "UX empty", date: new Date() },
  });
  await page.goto("/workouts");
  const summary = await page.locator(".workouts-summary-grid").textContent();
  const row = (title: string) =>
    page
      .locator("article.workout-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(row("UX live")).toContainText("Active");
  await expect(row("UX live")).toContainText("2 prescribed sets");
  await expect(row("UX live")).toContainText("1/2 sets completed");
  await expect(row("UX live")).not.toContainText("No sets yet");
  await expect(row("UX PAUSED")).toContainText("Paused");
  await expect(row("UX ABANDONED")).toContainText("Abandoned");
  await expect(row("UX COMPLETED")).toContainText("Completed");
  await expect(row("UX COMPLETED")).toContainText("300 Volume");
  await expect(row("UX empty")).toContainText("0/0 sets completed");
  await expect(
    row("UX ABANDONED").getByRole("link", { name: "Continue training" }),
  ).toHaveCount(0);
  await expect(
    row("UX PAUSED").getByRole("button", { name: "Repeat", exact: true }),
  ).toHaveCount(0);
  const count = await prisma.workout.count({ where: { userId } });
  await row("UX PAUSED")
    .getByRole("link", { name: "Continue training" })
    .click();
  expect(
    (
      await prisma.workout.findFirstOrThrow({
        where: { userId, title: "UX PAUSED" },
      })
    ).state,
  ).toBe("PAUSED");
  expect(await prisma.workout.count({ where: { userId } })).toBe(count);
  await page.goto("/workouts");
  await page.screenshot({
    path: info.outputPath("history-desktop.png"),
    caret: "initial",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await row("UX live").scrollIntoViewIfNeeded();
  await expect(row("UX live")).toBeInViewport();
  expect(
    (
      await new AxeBuilder({ page })
        .exclude("nextjs-portal")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("history-mobile.png"),
    caret: "initial",
  });
  await page.goto(`/workouts?exercise=${exerciseId}&q=UX`);
  await expect(page.locator("article.workout-card")).toHaveCount(4);
  await prisma.workout.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      userId,
      state: "ACTIVE",
      title: `Extra ${index}`,
      date: new Date(),
    })),
  });
  await page.goto("/workouts");
  await expect(page.locator("article.workout-card")).toHaveCount(20);
  await expect(page.locator(".workouts-summary-grid")).toHaveText(
    summary ?? "",
  );
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.locator("article.workout-card")).toHaveCount(7);
});

test("history remains searchable before the first completed workout", async ({
  page,
}) => {
  await prisma.workout.deleteMany({ where: { userId, state: "COMPLETED" } });
  await page.goto("/workouts");
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
  await page.getByLabel("Search", { exact: true }).fill("no match");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("No workouts match these filters.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No workouts yet.", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".workouts-summary-grid")).toHaveCount(0);
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page.locator("article.workout-card")).toHaveCount(1);
});

test("localized history, confirmation, and creation feedback use the selected language", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "locale", value: "zh-TW", url: "http://localhost:8784" },
  ]);
  await page.goto("/workouts");
  const row = page.locator("article.workout-card").filter({
    has: page.getByRole("heading", { name: "UX live", exact: true }),
  });
  await expect(row).toContainText("進行中");
  await expect(row).toContainText("已完成 0/2 組");
  await row.getByRole("link", { name: "繼續訓練" }).click();
  await page.getByRole("button", { name: "結束", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("2 組未完成");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "取消" })
    .click();
  await page.goto("/workouts/new");
  const title = page.locator('input[name="title"]');
  await title.evaluate((el) => el.removeAttribute("maxlength"));
  await title.fill("x".repeat(121));
  await page
    .locator("main")
    .getByRole("button", { name: "建立訓練", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "有效日期",
  );
});

test("focused creation preserves prefills and drafts, validates server-side, and retries network failure", async ({
  page,
}, info) => {
  const initialCount = await prisma.workout.count({ where: { userId } });
  await page.goto("/workouts");
  await page.getByRole("link", { name: "New workout", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts\/new$/);
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  expect(await prisma.workout.count({ where: { userId } })).toBe(initialCount);
  await page.goto("/workouts/new?date=2026-02-30");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    formatDateKey(new Date()),
  );
  await page.goto("/workouts/new?date=2026-10-01&date=2026-10-02");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("button", { name: "Create workout", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .exclude("nextjs-portal")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`creation-${width}.png`),
      caret: "initial",
      fullPage: true,
    });
  }
  const title = page.getByLabel("Title", { exact: true });
  const notes = page.getByLabel("Notes", { exact: true });
  await title.evaluate((el) => el.removeAttribute("maxlength"));
  await title.fill("x".repeat(121));
  await notes.fill("Creation draft");
  await page
    .getByRole("button", { name: "Create workout", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Enter a valid date",
  );
  await expect(title).toHaveValue("x".repeat(121));
  await expect(notes).toHaveValue("Creation draft");
  await title.fill("Created UX workout");
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/workouts/new?**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Create workout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create workout", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Not saved. Check the input",
  );
  await expect(notes).toHaveValue("Creation draft");
  expect(await prisma.workout.count({ where: { userId } })).toBe(initialCount);
  await page.unroute("**/workouts/new?**");
  await page
    .getByRole("button", { name: "Create workout", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workouts\/(?!new)[^/?]+$/);
  expect(await prisma.workout.count({ where: { userId } })).toBe(
    initialCount + 1,
  );
  const created = await prisma.workout.findFirstOrThrow({
    where: { userId, title: "Created UX workout" },
  });
  expect(formatDateKey(created.date)).toBe("2026-10-01");
  expect(created.notes).toBe("Creation draft");
});
