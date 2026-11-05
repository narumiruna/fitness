import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

test.afterAll(async () => prisma.$disconnect());

async function fixture(page: Page, locale: "en" | "zh-TW", sets = 0) {
  const key = `workout-entry-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      username: key,
      passwordHash: await bcrypt.hash("fixture-password", 4),
    },
  });
  const exercise = await prisma.exercise.create({
    data: {
      slug: key,
      defaultName: `Fixture press ${key.slice(-8)}`,
      createdByUserId: user.id,
    },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2026, 9, 21),
      sets: {
        create: Array.from({ length: sets }, (_, index) => ({
          exerciseId: exercise.id,
          order: index + 1,
          weight: 10 * (index + 1),
          reps: 8,
          completed: index !== 1,
          actualsEntered: index !== 1,
        })),
      },
    },
    include: { sets: { orderBy: { order: "asc" } } },
  });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(key);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page
    .context()
    .addCookies([
      { name: "locale", value: locale, url: new URL(page.url()).origin },
    ]);
  await page.goto(`/workouts/${workout.id}`);
  return {
    user,
    workout,
    exercise,
    async dispose() {
      const exercises = await prisma.exercise.findMany({
        where: { createdByUserId: user.id },
        select: { id: true },
      });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.exercise.deleteMany({
        where: { id: { in: exercises.map((exercise) => exercise.id) } },
      });
    },
  };
}

async function accessible(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

async function drag(page: Page, handle: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Missing drag controls");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

async function pickUpSet(page: Page, row: Locator) {
  await expect(row).not.toHaveAttribute("data-dragging");
  await row.locator(".recorded-set-drag-handle").focus();
  // A held key lets KeyboardSensor attach its deferred key listener before release.
  await page.keyboard.press("Space", { delay: 25 });
  await expect(row).toHaveAttribute("data-dragging", "true");
}

async function savedOrder(workoutId: string) {
  return (
    await prisma.workoutSet.findMany({
      where: { workoutId },
      orderBy: { order: "asc" },
    })
  ).map((set) => [set.id, set.order]);
}

for (const locale of ["en", "zh-TW"] as const) {
  test(`one-click workout creation retains its key after a lost response (${locale})`, async ({
    page,
  }) => {
    const data = await fixture(page, locale);
    const t = dictionary(locale);
    try {
      await page.goto("/workouts");
      const form = page.locator(".workout-create-form");
      const key = await form.locator('input[name="key"]').inputValue();
      const before = await prisma.workout.count({
        where: { userId: data.user.id },
      });
      await page.route(
        "**/api/actions/createWorkoutAction",
        async (route) => {
          await route.fetch();
          await route.abort();
        },
        { times: 1 },
      );
      await form
        .getByRole("button", { name: t("newWorkoutAction"), exact: true })
        .click();
      await expect(form.getByRole("alert")).toBeVisible();
      await expect(form.locator('input[name="key"]')).toHaveValue(key);
      expect(
        await prisma.workout.count({ where: { userId: data.user.id } }),
      ).toBe(before + 1);
      await form
        .getByRole("button", { name: t("newWorkoutAction"), exact: true })
        .click();
      await expect(page).toHaveURL(/\/workouts\/(?!new$)[^/]+$/);
      expect(
        await prisma.workout.count({ where: { userId: data.user.id } }),
      ).toBe(before + 1);
      const created = await prisma.workout.findUniqueOrThrow({
        where: { id: page.url().split("/").at(-1) },
      });
      expect(formatDateKey(created.date)).toBe(formatDateKey(new Date()));
      expect(created.title).toBeNull();
      expect(created.notes).toBeNull();
      const edit = page.locator("details").filter({
        has: page.locator(`summary:text-is("${t("editWorkout")}")`),
      });
      await edit.locator("summary").click();
      await edit.getByLabel(t("date"), { exact: true }).fill("2026-10-20");
      await edit
        .getByLabel(t("workoutTitle"), { exact: true })
        .fill("Later title");
      await edit
        .getByLabel(t("notes"), { exact: true })
        .fill("Written afterward");
      await edit
        .getByRole("button", { name: t("updateWorkout"), exact: true })
        .click();
      await expect
        .poll(async () => {
          const workout = await prisma.workout.findUniqueOrThrow({
            where: { id: created.id },
          });
          return [formatDateKey(workout.date), workout.title, workout.notes];
        })
        .toEqual(["2026-10-20", "Later title", "Written afterward"]);
    } finally {
      await data.dispose();
    }
  });

  test(`inline exercise creation keeps the set draft and appends without order input (${locale})`, async ({
    page,
  }, info) => {
    const data = await fixture(page, locale);
    const t = dictionary(locale);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const add = page.locator(".workout-add-set-form");
      await expect(add.locator('[name="order"]')).toHaveCount(0);
      await add.getByLabel(t("weight"), { exact: true }).fill("25.5");
      await add.getByLabel(t("reps"), { exact: true }).fill("8");
      await add.getByLabel(t("rir"), { exact: true }).fill("1.5");
      await add.getByLabel(t("notes"), { exact: true }).fill("Keep this draft");
      await add
        .getByRole("combobox", { name: t("exercise"), exact: true })
        .click();
      await page
        .getByRole("option", { name: t("createExercise"), exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: t("createExercise"),
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await accessible(page);
      const name = dialog.getByLabel(t("defaultName"), { exact: true });
      await name.fill(data.exercise.defaultName);
      await dialog
        .getByRole("button", { name: t("createExercise"), exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toHaveText(
        t("duplicateExercise"),
      );
      const newName = `New press ${randomUUID().slice(0, 8)}`;
      await name.fill(newName);
      await page.route(
        "**/api/actions/createExerciseOptionAction",
        (route) => route.abort(),
        { times: 1 },
      );
      await dialog
        .getByRole("button", { name: t("createExercise"), exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toHaveText(t("saveFailed"));
      await expect(name).toHaveValue(newName);
      await expect(add.getByLabel(t("weight"), { exact: true })).toHaveValue(
        "25.5",
      );
      await dialog
        .getByRole("button", { name: t("createExercise"), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/workouts/${data.workout.id}$`));
      await expect(
        add.getByRole("combobox", { name: t("exercise"), exact: true }),
      ).toContainText(newName);
      await expect(add.getByLabel(t("rir"), { exact: true })).toHaveValue(
        "1.5",
      );
      await expect(add.getByLabel(t("notes"), { exact: true })).toHaveValue(
        "Keep this draft",
      );
      expect(
        await prisma.workoutSet.count({
          where: { workoutId: data.workout.id },
        }),
      ).toBe(0);
      await add.getByRole("button", { name: t("addSet"), exact: true }).click();
      await expect(page.locator("article.recorded-set")).toHaveCount(1);
      await add.getByLabel(t("weight"), { exact: true }).fill("30");
      await add.getByLabel(t("reps"), { exact: true }).fill("6");
      await add.getByRole("button", { name: t("addSet"), exact: true }).click();
      await expect(page.locator("article.recorded-set")).toHaveCount(2);
      const sets = await prisma.workoutSet.findMany({
        where: { workoutId: data.workout.id },
        orderBy: { order: "asc" },
        include: { exercise: true },
      });
      expect(
        sets.map((set) => [
          set.order,
          set.exercise.defaultName,
          set.weight,
          set.reps,
        ]),
      ).toEqual([
        [1, newName, 25.5, 8],
        [2, newName, 30, 6],
      ]);
      await accessible(page);
      await page.screenshot({
        path: info.outputPath(`inline-exercise-${locale}.png`),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } finally {
      await data.dispose();
    }
  });

  test(`drag and keyboard sorting preserve drafts, recover failures, and persist (${locale})`, async ({
    page,
  }, info) => {
    const data = await fixture(page, locale, 3);
    const t = dictionary(locale);
    const ids = data.workout.sets.map((set) => set.id);
    const row = (id: string) =>
      page.locator(`article.recorded-set[data-set-id="${id}"]`);
    const handle = (id: string) => row(id).locator(".recorded-set-drag-handle");
    try {
      await page.setViewportSize({
        width: locale === "en" ? 1440 : 390,
        height: 1000,
      });
      await row(ids[0]).locator("summary").click();
      await row(ids[0]).getByLabel(t("weight"), { exact: true }).fill("11.5");
      await expect(
        row(ids[0]).locator('input[type="number"][name="order"]'),
      ).toHaveCount(0);
      await row(ids[0]).locator("summary").click();
      await drag(page, handle(ids[2]), handle(ids[0]));
      await expect
        .poll(() => savedOrder(data.workout.id))
        .toEqual([
          [ids[2], 1],
          [ids[0], 2],
          [ids[1], 3],
        ]);
      await expect(
        page.getByRole("status").filter({ hasText: t("reorderSetsSaved") }),
      ).toBeVisible();
      await row(ids[0]).locator("summary").click();
      await expect(
        row(ids[0]).getByLabel(t("weight"), { exact: true }),
      ).toHaveValue("11.5");
      await expect(row(ids[0]).locator('input[name="order"]')).toHaveValue("2");
      await row(ids[0])
        .getByRole("button", { name: t("updateSet"), exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await prisma.workoutSet.findUniqueOrThrow({
                where: { id: ids[0] },
              })
            ).weight,
        )
        .toBe(11.5);
      await expect(row(ids[0]).locator("details")).not.toHaveAttribute("open");
      await pickUpSet(page, row(ids[2]));
      await page.keyboard.press("ArrowDown");
      await expect(page.locator('[aria-live="assertive"]')).toHaveText(
        t("reorderSetOver").replace("{position}", "2"),
      );
      await page.keyboard.press("Space");
      await expect
        .poll(() => savedOrder(data.workout.id))
        .toEqual([
          [ids[0], 1],
          [ids[2], 2],
          [ids[1], 3],
        ]);
      await expect(handle(ids[2])).toBeEnabled();
      await expect(handle(ids[2])).toBeFocused();
      await pickUpSet(page, row(ids[2]));
      await page.keyboard.press("ArrowDown");
      await expect(page.locator('[aria-live="assertive"]')).toHaveText(
        t("reorderSetOver").replace("{position}", "3"),
      );
      await page.keyboard.press("Escape");
      expect(await savedOrder(data.workout.id)).toEqual([
        [ids[0], 1],
        [ids[2], 2],
        [ids[1], 3],
      ]);
      await page.route(
        "**/api/actions/reorderWorkoutSetsAction",
        (route) => route.abort(),
        { times: 1 },
      );
      await drag(page, handle(ids[0]), handle(ids[1]));
      await expect(page.getByRole("alert")).toHaveText(t("reorderSetsFailed"));
      expect(
        await page
          .locator("article.recorded-set")
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute("data-set-id")),
          ),
      ).toEqual([ids[0], ids[2], ids[1]]);
      await expect(handle(ids[0])).toBeDisabled();
      await expect(
        page.getByRole("button", { name: t("refreshSetOrder"), exact: true }),
      ).toBeFocused();
      await accessible(page);
      await page
        .getByRole("button", { name: t("refreshSetOrder"), exact: true })
        .click();
      await expect(handle(ids[0])).toBeEnabled();
      await expect(handle(ids[0])).toBeFocused();
      await pickUpSet(page, row(ids[0]));
      await page.keyboard.press("ArrowDown");
      await expect(page.locator('[aria-live="assertive"]')).toHaveText(
        t("reorderSetOver").replace("{position}", "2"),
      );
      await page.keyboard.press("Space");
      await expect
        .poll(() => savedOrder(data.workout.id))
        .toEqual([
          [ids[2], 1],
          [ids[0], 2],
          [ids[1], 3],
        ]);
      await page.reload();
      await expect(page.locator("article.recorded-set")).toHaveCount(3);
      expect(
        await page
          .locator("article.recorded-set")
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute("data-set-id")),
          ),
      ).toEqual([ids[2], ids[0], ids[1]]);
      await accessible(page);
      await page.screenshot({
        path: info.outputPath(`set-order-${locale}.png`),
        fullPage: true,
      });
    } finally {
      await data.dispose();
    }
  });
}

test("a lost committed reorder response blocks edits until the confirmed order is loaded", async ({
  page,
}) => {
  const data = await fixture(page, "en", 3);
  const t = dictionary("en");
  const ids = data.workout.sets.map((set) => set.id);
  const row = (id: string) =>
    page.locator(`article.recorded-set[data-set-id="${id}"]`);
  try {
    await page.setViewportSize({ width: 390, height: 1000 });
    await row(ids[0]).locator("summary").click();
    await row(ids[0]).getByLabel(t("weight"), { exact: true }).fill("12.5");
    await row(ids[0]).locator("summary").click();
    await page.route(
      "**/api/actions/reorderWorkoutSetsAction",
      async (route) => {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort();
      },
      { times: 1 },
    );
    await drag(
      page,
      row(ids[2]).locator(".recorded-set-drag-handle"),
      row(ids[0]).locator(".recorded-set-drag-handle"),
    );
    await expect(page.getByRole("alert")).toHaveText(t("reorderSetsFailed"));
    await expect
      .poll(() => savedOrder(data.workout.id))
      .toEqual([
        [ids[2], 1],
        [ids[0], 2],
        [ids[1], 3],
      ]);
    await row(ids[0]).locator("summary").click();
    await expect(
      row(ids[0]).getByLabel(t("weight"), { exact: true }),
    ).toBeDisabled();
    await expect(
      row(ids[0]).getByLabel(t("weight"), { exact: true }),
    ).toHaveValue("12.5");
    await accessible(page);
    await page
      .getByRole("button", { name: t("refreshSetOrder"), exact: true })
      .click();
    await expect(
      row(ids[2]).locator(".recorded-set-drag-handle"),
    ).toBeFocused();
    await expect(
      row(ids[0]).getByLabel(t("weight"), { exact: true }),
    ).toBeEnabled();
    await expect(row(ids[0]).locator('input[name="order"]')).toHaveValue("2");
    await row(ids[0])
      .getByRole("button", { name: t("updateSet"), exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await prisma.workoutSet.findUniqueOrThrow({ where: { id: ids[0] } }))
            .weight,
      )
      .toBe(12.5);
    expect(await savedOrder(data.workout.id)).toEqual([
      [ids[2], 1],
      [ids[0], 2],
      [ids[1], 3],
    ]);
  } finally {
    await data.dispose();
  }
});

test("touch drag moves a set without entering a numeric order", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: { width: 390, height: 1000 },
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const data = await fixture(page, "en", 3);
  try {
    const handles = page.locator(".recorded-set-drag-handle");
    await handles.first().scrollIntoViewIfNeeded();
    const from = await handles.first().boundingBox();
    const to = await handles.nth(1).boundingBox();
    if (!from || !to) throw new Error("Missing touch handles");
    const client = await context.newCDPSession(page);
    const x = from.x + from.width / 2;
    const start = from.y + from.height / 2;
    const end = to.y + to.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: start }],
    });
    for (let step = 1; step <= 12; step++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: start + ((end - start) * step) / 12 }],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const ids = data.workout.sets.map((set) => set.id);
    await expect
      .poll(() => savedOrder(data.workout.id))
      .toEqual([
        [ids[1], 1],
        [ids[0], 2],
        [ids[2], 3],
      ]);
    await page.screenshot({
      path: info.outputPath("touch-set-order.png"),
      fullPage: true,
    });
  } finally {
    await data.dispose();
    await context.close();
  }
});
