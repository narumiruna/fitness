import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

const key = randomUUID();
const prefix = `Filter ${key}`;
const exerciseIds: string[] = [];
let userId: string;
let username: string;

test.beforeAll(async () => {
  username = `filters-${key}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("filter-password", 4) },
  });
  userId = user.id;
  for (const [suffix, muscle, tool] of [
    ["Press Alpha", "chest", "barbell"],
    ["Press Omega", "chest", "barbell"],
    ["Press Dumbbell", "chest", "dumbbell"],
    ["Press Shoulder", "shoulders", "dumbbell"],
    ["Squat", "quadriceps", "barbell"],
  ]) {
    const exercise = await prisma.exercise.create({
      data: {
        slug: `filters-${key}-${exerciseIds.length}`,
        defaultName: `${prefix} ${suffix}`,
        createdByUserId: userId,
        muscles: { create: { muscle, role: "PRIMARY" } },
        equipment: { create: { equipment: tool } },
      },
    });
    exerciseIds.push(exercise.id);
  }
  await prisma.workout.create({
    data: {
      userId,
      date: new Date(),
      sets: {
        create: { exerciseId: exerciseIds[1], order: 1, weight: 20, reps: 5 },
      },
    },
  });
});

test.afterAll(async () => {
  try {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

type Criteria = { q: string; sort: string; muscle: string; equipment: string };

async function expectCriteria(page: Page, form: Locator, criteria: Criteria) {
  await expect(page).toHaveURL((url) =>
    Object.entries(criteria).every(
      ([name, value]) => url.searchParams.get(name) === value,
    ),
  );
  const params = new URL(page.url()).searchParams;
  for (const [name, value] of Object.entries(criteria)) {
    expect(params.get(name), name).toBe(value);
    await expect(form.locator(`[name="${name}"]`)).toHaveValue(value);
  }
  // Edited values can match before the query response commits a replacement form.
  await expect(form.locator('input[name="q"]')).toHaveAttribute(
    "value",
    criteria.q,
  );
  await expect(form.locator("details")).not.toHaveAttribute("open");
}

async function choose(page: Page, form: Locator, name: string, value: string) {
  const details = form.locator("details");
  if (!(await details.evaluate((element) => element.hasAttribute("open"))))
    await form.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await form.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

for (const locale of ["en", "zh-TW"] as const) {
  test(`exercise criteria remain combined through submit, reload, back, and clear (${locale})`, async ({
    page,
    context,
  }) => {
    const t = dictionary(locale);
    // Exercise the pending query state instead of relying on loopback response speed.
    await page.route("**/api/views/exercises?**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });
    await page.goto("/login");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("filter-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    await page.goto(
      `/exercises?${new URLSearchParams({ q: prefix, sort: "recent", muscle: "chest", equipment: "barbell" })}`,
    );
    const form = page.locator("form.library-query");
    await expect(page.locator('form:has([name="q"])')).toHaveCount(1);
    await expect(form.getByLabel(t("search"), { exact: true })).toBeVisible();
    await expect(form.locator("details")).not.toHaveAttribute("open");
    await expect(form).toContainText(`${t("muscle")}: ${t("chest")}`);
    await expect(form).toContainText(`${t("equipment")}: ${t("barbell")}`);
    await expect(page.locator(".exercise-row h3").first()).toHaveText(
      `${prefix} Press Omega`,
    );

    const criteria: Criteria = {
      q: `${prefix} Press`,
      sort: "recent",
      muscle: "chest",
      equipment: "barbell",
    };
    await form.getByLabel(t("search"), { exact: true }).fill(criteria.q);
    await form.getByRole("button", { name: t("search"), exact: true }).click();
    await expectCriteria(page, form, criteria);
    await expect(page.locator(".exercise-row")).toHaveCount(2);

    await choose(page, form, t("sort"), t("nameDescending"));
    criteria.sort = "desc";
    await form.getByRole("button", { name: t("search"), exact: true }).click();
    await expectCriteria(page, form, criteria);
    await expect(page.locator(".exercise-row h3")).toHaveText([
      `${prefix} Press Omega`,
      `${prefix} Press Alpha`,
    ]);

    await choose(page, form, t("equipment"), t("dumbbell"));
    criteria.equipment = "dumbbell";
    await form.getByRole("button", { name: t("search"), exact: true }).click();
    await expectCriteria(page, form, criteria);
    await expect(page.locator(".exercise-row h3")).toHaveText([
      `${prefix} Press Dumbbell`,
    ]);

    await choose(page, form, t("muscle"), t("shoulders"));
    criteria.muscle = "shoulders";
    await form.getByRole("button", { name: t("search"), exact: true }).click();
    await expectCriteria(page, form, criteria);
    await expect(page.locator(".exercise-row h3")).toHaveText([
      `${prefix} Press Shoulder`,
    ]);
    await expect(form.locator("details")).not.toHaveAttribute("open");
    await expect(
      form.getByText(
        `${t("sort")}: ${t("nameDescending")} · ${t("muscle")}: ${t("shoulders")} · ${t("equipment")}: ${t("dumbbell")}`,
        { exact: true },
      ),
    ).toBeVisible();

    await page.reload();
    await expectCriteria(page, form, criteria);
    await page.goBack();
    await expectCriteria(page, form, { ...criteria, muscle: "chest" });
    await expect(page.locator(".exercise-row h3")).toHaveText([
      `${prefix} Press Dumbbell`,
    ]);
    await page.goBack();
    await expectCriteria(page, form, {
      ...criteria,
      muscle: "chest",
      equipment: "barbell",
    });
    await expect(page.locator(".exercise-row")).toHaveCount(2);
    await page.goForward();
    await page.goForward();
    await expectCriteria(page, form, criteria);
    await expect(page.locator(".exercise-row h3")).toHaveText([
      `${prefix} Press Shoulder`,
    ]);

    await form
      .getByLabel(t("search"), { exact: true })
      .fill("no matching exercise");
    await form.getByRole("button", { name: t("search"), exact: true }).click();
    await expect(
      page.getByText(t("noExerciseResults"), { exact: true }),
    ).toBeVisible();
    await form
      .getByRole("link", { name: t("clearFilters"), exact: true })
      .click();
    await expect(page).toHaveURL(/\/exercises$/);
    await expect(form.locator('[name="q"]')).toHaveValue("");
    await expect(form.locator('[name="sort"]')).toHaveValue("asc");
    await expect(form.locator('[name="muscle"]')).toHaveValue("all");
    await expect(form.locator('[name="equipment"]')).toHaveValue("all");
    await form.locator("summary").click();
    await expect(
      form.getByRole("combobox", { name: t("muscle"), exact: true }),
    ).toHaveText(t("allMuscles"));
    await expect(
      form.getByRole("combobox", { name: t("equipment"), exact: true }),
    ).toHaveText(t("allEquipment"));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/exercises?q=${encodeURIComponent(prefix)}`);
    await expect(
      form.getByLabel(t("search"), { exact: true }),
    ).toBeInViewport();
    await expect(page.locator(".exercise-row h3").first()).toBeInViewport();
    await expect(
      page.locator("details").filter({ has: page.locator(".stats-card-grid") }),
    ).not.toHaveAttribute("open");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
}
