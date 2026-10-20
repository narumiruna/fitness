import { randomUUID } from "node:crypto";
import {
  buildCalendarMonth,
  formatDateKey,
} from "@narumitw/fitness-core/calendar";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { slugifyExerciseName } from "../../api/src/lib/exercises";
import { prisma } from "../../api/src/lib/prisma";

let userId: string;
const exerciseIds: string[] = [];
test.beforeEach(async ({ page }) => {
  const username = `review-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("review-password", 4) },
  });
  userId = user.id;
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("review-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
});
test.afterEach(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.exercise.deleteMany({
    where: { id: { in: exerciseIds.splice(0) } },
  });
});
test.afterAll(async () => prisma.$disconnect());

test("default solid actions stay teal while explicit destructive accents remain red", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const primary = page.getByRole("link", { name: "New workout", exact: true });
  await expect(primary).toHaveCSS("background-color", "rgb(8, 117, 101)");
  await prisma.passkey.create({
    data: {
      id: randomUUID(),
      userId,
      name: "Review device",
      publicKey: Buffer.from("unused-test-key"),
      counter: 0,
    },
  });
  await page.goto("/account/passkeys");
  const remove = page.getByRole("button", { name: "Delete: Review device" });
  await expect(remove).toHaveAttribute("data-accent-color", "red");
  const colors = await remove.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = style.getPropertyValue("--accent-12");
    element.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: style.backgroundColor, expected };
  });
  expect(colors.actual).toBe(colors.expected);
  expect(colors.actual).not.toBe("rgb(8, 117, 101)");
  await page.screenshot({ path: info.outputPath("explicit-red-delete.png") });
});

test("monthly workout labels translate the full phrase for zero, one and many", async ({
  page,
  context,
}) => {
  for (const count of [0, 1, 3]) {
    await prisma.workout.deleteMany({ where: { userId } });
    if (count)
      await prisma.workout.createMany({
        data: Array.from({ length: count }, () => ({
          userId,
          date: new Date(),
        })),
      });
    for (const locale of ["en", "zh-TW"]) {
      await context.addCookies([
        { name: "locale", value: locale, url: "http://localhost:8784" },
      ]);
      await page.goto("/workouts");
      await expect(page.locator(".mini-calendar > .rt-Text")).toHaveText(
        locale === "en"
          ? `${count} ${count === 1 ? "workout" : "workouts"} this month`
          : `本月 ${count} 次訓練`,
      );
    }
  }
});

test("duplicate exercise and alias feedback remains directly below the header", async ({
  page,
}, info) => {
  const key = randomUUID();
  const name = `Review movement ${key}`;
  for (let i = 0; i < 30; i++) {
    const defaultName = i === 0 ? name : `${name} ${i}`;
    const exercise = await prisma.exercise.create({
      data: {
        slug: slugifyExerciseName(defaultName),
        defaultName,
        createdByUserId: userId,
      },
    });
    exerciseIds.push(exercise.id);
  }
  await prisma.exerciseAlias.create({
    data: {
      exerciseId: exerciseIds[0],
      locale: "en",
      alias: `Review alias ${key}`,
      normalizedAlias: `review alias ${key}`,
    },
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/exercises");
  await page.getByLabel("Default name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create exercise", exact: true })
    .click();
  await expect(page).toHaveURL(/error=duplicate/);
  const alert = page.locator("main").getByRole("alert");
  await expect(alert).toContainText("This exercise name already exists.");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    const header = await page.locator(".page-header").boundingBox();
    const error = await alert.boundingBox();
    const library = await page
      .getByRole("heading", { name: "Exercise library", exact: true })
      .boundingBox();
    expect(header && error && library).toBeTruthy();
    if (!header || !error || !library)
      throw new Error("Missing dashboard bounds");
    expect(error.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(error.y + error.height).toBeLessThan(library.y);
    expect(error.y + error.height).toBeLessThan(1080);
    await page.screenshot({
      path: info.outputPath(`duplicate-alert-${width}.png`),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  const row = page
    .locator(".exercise-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const aliasBadge = await row.locator(".alias-list .rt-Badge").boundingBox();
  const actions = await row.locator(".exercise-actions").boundingBox();
  if (!aliasBadge || !actions) throw new Error("Missing alias/action bounds");
  expect(aliasBadge.x + aliasBadge.width).toBeLessThanOrEqual(actions.x);
  await row.getByRole("button", { name: "Add alias", exact: true }).click();
  await row.getByLabel("Locale", { exact: true }).fill("en");
  await row.getByLabel("Alias", { exact: true }).fill(`Review alias ${key}`);
  await row
    .locator("form")
    .getByRole("button", { name: "Add alias", exact: true })
    .click();
  await expect(page).toHaveURL(/error=alias/);
  await expect(alert).toContainText("already exists for this locale");
  const error = await alert.boundingBox();
  expect(error?.y).toBeLessThan(300);
  await page.screenshot({ path: info.outputPath("alias-alert-1440.png") });
});

test("keyboard users can bypass the header on desktop and mobile in both languages", async ({
  page,
  context,
}) => {
  for (const locale of ["en", "zh-TW"]) {
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/workouts");
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", {
        name: locale === "en" ? "Skip to content" : "跳至主要內容",
        exact: true,
      });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      await expect(page.getByRole("main")).toBeInViewport();
    }
    const today = formatDateKey(new Date());
    await prisma.workout.create({ data: { userId, date: new Date() } });
    await page.goto("/workouts");
    await expect(
      page.locator(`.mini-day[aria-label="${today}"]`),
    ).toHaveAccessibleDescription(
      locale === "en"
        ? "Completed workouts on this date."
        : "此日期有已完成的訓練。",
    );
    await expect(
      page.locator(".mini-day:not(.has-workout)").first(),
    ).not.toHaveAttribute("aria-describedby");
  }
});

async function addMuscleExercise(muscle: string, role: string) {
  const name = `Review ${muscle} ${role} ${randomUUID()}`;
  const exercise = await prisma.exercise.create({
    data: {
      slug: slugifyExerciseName(name),
      defaultName: name,
      createdByUserId: userId,
      muscles: { create: { muscle, role } },
    },
  });
  exerciseIds.push(exercise.id);
  return exercise;
}

test("muscle-group counts match primary and secondary filter results", async ({
  page,
}) => {
  const primary = await addMuscleExercise("chest", "PRIMARY");
  const secondary = await addMuscleExercise("chest", "SECONDARY");
  await page.goto("/exercises");
  const group = page.locator(
    '.muscle-group-row[href="/exercises?muscle=chest"]',
  );
  const count = Number.parseInt(
    await group.locator(".rt-Text.rt-r-size-1").innerText(),
    10,
  );
  await group.click();
  await expect(page).toHaveURL(/muscle=chest/);
  await expect(page.locator(".exercise-row")).toHaveCount(count);
  await expect(
    page.getByRole("link", { name: primary.defaultName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: secondary.defaultName, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".exercise-sidebar")
      .getByRole("heading", { name: "Muscle groups", exact: true }),
  ).toBeVisible();
});

test("muscle-group counts translate complete singular and plural labels", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await addMuscleExercise("calves", "PRIMARY");
  await addMuscleExercise("hamstrings", "PRIMARY");
  await addMuscleExercise("hamstrings", "SECONDARY");
  await addMuscleExercise("hamstrings", "PRIMARY");
  for (const locale of ["en", "zh-TW"]) {
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    await page.goto("/exercises");
    for (const [muscle, count] of [
      ["calves", 1],
      ["hamstrings", 3],
    ] as const) {
      const group = page.locator(
        `.muscle-group-row[href="/exercises?muscle=${muscle}"]`,
      );
      await expect(group.locator(".rt-Text.rt-r-size-1")).toHaveText(
        locale === "en"
          ? `${count} ${count === 1 ? "exercise" : "exercises"}`
          : `${count} 個動作`,
      );
    }
    await page.screenshot({
      path: info.outputPath(`muscle-counts-${locale}.png`),
    });
  }
});

test("mini-calendar marks adjacent-month workouts without inflating this month's count", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const today = new Date();
  const calendar = buildCalendarMonth(
    today.getFullYear(),
    today.getMonth() + 1,
    today,
  );
  const adjacent = calendar.cells.filter((day) => !day.isCurrentMonth);
  const first = adjacent[0];
  const last = adjacent[adjacent.length - 1];
  await prisma.workout.createMany({
    data: [today, first.date, last.date, calendar.endDate].map((date) => ({
      userId,
      date,
    })),
  });
  await prisma.workout.create({
    data: { userId, date: adjacent[1].date, state: "ABANDONED" },
  });
  const other = await prisma.user.create({
    data: {
      username: `review-other-${randomUUID()}`,
      passwordHash: await bcrypt.hash("unused-test-password", 4),
      workouts: { create: { date: adjacent[2].date } },
    },
  });
  try {
    await page.goto("/workouts");
    await expect(page.locator(".mini-day")).toHaveCount(42);
    for (const date of [today, first.date, last.date])
      await expect(
        page.locator(`.mini-day[aria-label="${formatDateKey(date)}"]`),
      ).toHaveClass(/has-workout/);
    await expect(page.locator(".mini-day.has-workout")).toHaveCount(3);
    await expect(page.locator(".mini-calendar > .rt-Text")).toHaveText(
      "1 workout this month",
    );
    await page.screenshot({
      path: info.outputPath("adjacent-month-indicators.png"),
    });
    const adjacentDay = page.locator(`.mini-day[aria-label="${last.dateKey}"]`);
    await expect(adjacentDay).toHaveAccessibleDescription(
      "Completed workouts on this date.",
    );
    await adjacentDay.click();
    await expect(page).toHaveURL(
      new RegExp(
        `year=${last.date.getFullYear()}&month=${last.date.getMonth() + 1}&day=${last.dateKey}#selected-date$`,
      ),
    );
    await expect(page.locator(".selected-workout")).toHaveCount(1);
    await expect(page.locator(".selected-date-panel")).toBeInViewport();
  } finally {
    await prisma.user.delete({ where: { id: other.id } });
  }
});
