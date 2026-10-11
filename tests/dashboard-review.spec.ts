import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { slugifyExerciseName } from "../src/lib/exercises";
import { prisma } from "../src/lib/prisma";

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
