import { randomUUID } from "node:crypto";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

const evidence = ".cache/uiux-review-2";
let userId: string;
let otherId: string;
let exerciseId: string;
let selected: string;
const sessions: Record<string, string> = {};

test.beforeEach(async ({ page }) => {
  const username = `context-${randomUUID()}`;
  const passwordHash = await bcrypt.hash("context-password", 4);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  userId = user.id;
  const other = await prisma.user.create({
    data: { username: `${username}-other`, passwordHash },
  });
  otherId = other.id;
  const exercise = await prisma.exercise.create({
    data: { slug: username, defaultName: username, createdByUserId: userId },
  });
  exerciseId = exercise.id;
  const date = new Date();
  date.setDate(date.getDate() - 2);
  date.setHours(12, 0, 0, 0);
  selected = formatDateKey(date);
  for (const state of ["COMPLETED", "ACTIVE", "PAUSED", "ABANDONED"]) {
    const workout = await prisma.workout.create({
      data: {
        userId,
        date,
        title: `Context ${state}`,
        state,
        sets: {
          create: [
            { exerciseId, order: 0, weight: 60, reps: 5 },
            { exerciseId, order: 1, weight: 20, reps: 10 },
            {
              exerciseId,
              order: 2,
              weight: 999,
              reps: 999,
              completed: false,
              actualsEntered: false,
            },
          ],
        },
      },
    });
    sessions[state] = workout.id;
  }
  await prisma.workout.create({
    data: { userId: otherId, date, title: "Private other workout" },
  });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("context-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({
      path: `${evidence}/context-${info.title.split(":")[0]}-failed-${Date.now()}.png`,
      fullPage: true,
    });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await prisma.exercise.deleteMany({ where: { id: exerciseId } });
});
test.afterAll(async () => prisma.$disconnect());

async function setLocale(page: Page, locale: "en" | "zh-TW") {
  await page.getByRole("combobox", { name: /^(Language|語言)$/ }).click();
  await page
    .getByRole("option", {
      name: locale === "en" ? "English" : "正體中文",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: dictionary(locale)("language"),
      exact: true,
    }),
  ).toBeEnabled();
}

async function choose(form: Locator, label: string, option: string) {
  await form.getByRole("combobox", { name: label, exact: true }).click();
  await form.page().getByRole("option", { name: option, exact: true }).click();
}

test("calendar: ongoing context is not empty actuals", async ({ page }) => {
  const [year, month] = selected.split("-").map(Number);
  const href = `/calendar?year=${year}&month=${month}&day=${selected}#selected-date`;
  const before = await prisma.workout.findMany({
    where: { userId },
    include: { sets: true },
    orderBy: { id: "asc" },
  });
  for (const locale of ["en", "zh-TW"] as const) {
    const t = dictionary(locale);
    await setLocale(page, locale);
    await page.goto(href);
    const panel = page.locator("#selected-date");
    await expect(panel.locator("article")).toHaveCount(4);
    await expect(page.getByText("Private other workout")).toHaveCount(0);
    await expect(
      page.locator(`[aria-label="${selected}"][aria-current="date"]`),
    ).toBeVisible();
    const completed = panel
      .locator("article")
      .filter({ hasText: "Context COMPLETED" });
    await expect(completed).toContainText(`2 ${t("sets")}`);
    await expect(completed).toContainText(`500 ${t("volume")}`);
    await expect(completed).not.toContainText("999");
    await expect(completed).toContainText(
      await prisma.exercise
        .findUniqueOrThrow({ where: { id: exerciseId } })
        .then((e) => e.defaultName),
    );
    for (const state of ["ACTIVE", "PAUSED", "ABANDONED"]) {
      const card = panel
        .locator("article")
        .filter({ hasText: `Context ${state}` });
      await expect(card).not.toContainText(t("noSets"));
      await expect(card).not.toContainText(`0 ${t("sets")}`);
      await expect(card).not.toContainText(`0 ${t("volume")}`);
      await expect(card).toContainText(
        t(state === "ABANDONED" ? "calendarEndedHelp" : "calendarOngoingHelp"),
      );
      const link = card.getByRole("link", {
        name: t(state === "ABANDONED" ? "viewDetails" : "continueTraining"),
        exact: true,
      });
      await expect(link).toHaveAttribute(
        "href",
        `/workouts/${sessions[state]}`,
      );
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/workouts/${sessions[state]}$`));
      await page.goto(href);
    }
    await expect(page.locator(".calendar-agenda .agenda-item")).toHaveCount(1);
    await expect(
      panel.getByRole("link", { name: new RegExp(t("createWorkout")) }),
    ).toHaveAttribute("href", `/workouts/new?date=${selected}`);
    await panel
      .getByRole("link", { name: new RegExp(t("createWorkout")) })
      .click();
    await expect(page.locator('input[name="date"]')).toHaveValue(selected);
    await page.goto(href);
    await page.screenshot({
      path: `${evidence}/context-calendar-${locale}-green.png`,
      fullPage: true,
    });
  }
  expect(
    await prisma.workout.findMany({
      where: { userId },
      include: { sets: true },
      orderBy: { id: "asc" },
    }),
  ).toEqual(before);
});

test("stats: each filter keeps the other URL selections", async ({ page }) => {
  for (const locale of ["en", "zh-TW"] as const) {
    const t = dictionary(locale);
    await setLocale(page, locale);
    const combined = "/stats?range=90&records=range&year=2022";
    for (const control of ["range", "records", "year"]) {
      await page.goto(combined);
      const form = page.locator(
        control === "range"
          ? "form.range-filter:not(.records-filter)"
          : control === "records"
            ? "form.records-filter"
            : "form.card-actions",
      );
      if (control === "range")
        await choose(form, t("dateRange"), t("last30Days"));
      if (control === "records")
        await choose(form, t("recordScope"), t("allTimeRecords"));
      if (control === "year")
        await form.getByRole("spinbutton", { name: t("year") }).fill("2023");
      await form
        .getByRole("button", { name: t("applyFilters"), exact: true })
        .click();
      const expected = {
        range: control === "range" ? "30" : "90",
        records: control === "records" ? "all" : "range",
        year: control === "year" ? "2023" : "2022",
      };
      await expect
        .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual(expected);
      await page.reload();
      await expect(
        page.getByRole("spinbutton", { name: t("year") }),
      ).toHaveValue(expected.year);
      await expect(
        page.getByRole("combobox", { name: t("recordScope"), exact: true }),
      ).toHaveText(
        t(expected.records === "range" ? "rangeRecords" : "allTimeRecords"),
      );
      await page.goBack();
      await expect(
        page.getByRole("spinbutton", { name: t("year") }),
      ).toHaveValue("2022");
      await expect(
        page.getByRole("combobox", { name: t("recordScope"), exact: true }),
      ).toHaveText(t("rangeRecords"));
      await page.goForward();
      await expect(
        page.getByRole("spinbutton", { name: t("year") }),
      ).toHaveValue(expected.year);
      await expect(
        page.getByRole("combobox", { name: t("dateRange"), exact: true }),
      ).toHaveText(t(expected.range === "30" ? "last30Days" : "last90Days"));
      await expect(
        page
          .locator(".stats-card-grid .stats-card")
          .filter({ hasText: t("totalVolume") }),
      ).toContainText("500");
    }
    for (const year of ["1899", "10000", "invalid"]) {
      await page.goto(`/stats?range=invalid&records=invalid&year=${year}`);
      await expect(
        page.getByRole("spinbutton", { name: t("year") }),
      ).toHaveValue(String(new Date().getFullYear()));
      const form = page.locator("form.card-actions");
      await form
        .getByRole("button", { name: t("applyFilters"), exact: true })
        .click();
      await expect
        .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual({
          range: "all",
          records: "all",
          year: String(new Date().getFullYear()),
        });
    }
    await page.screenshot({
      path: `${evidence}/context-stats-${locale}-green.png`,
      fullPage: true,
    });
  }
});

test("alias: close and reopen keeps drafts, pending guard and feedback", async ({
  page,
}) => {
  for (const locale of ["en", "zh-TW"] as const) {
    const t = dictionary(locale);
    await setLocale(page, locale);
    await page.goto("/exercises");
    const row = page
      .locator(".exercise-row")
      .filter({ has: page.locator(`a[href="/exercises/${exerciseId}"]`) });
    const disclosure = row.locator(".inline-disclosure");
    const trigger = disclosure
      .getByRole("button", { name: t("addAlias"), exact: true })
      .first();
    const form = disclosure.locator("form");
    const alias = form.getByLabel(t("alias"), { exact: true });
    const language = form.getByLabel(t("locale"), { exact: true });
    const draft = `Context alias ${locale}`;
    await trigger.click();
    await alias.fill(draft);
    await language.fill("en");
    await trigger.click();
    await trigger.click();
    await expect(alias).toHaveValue(draft);
    await expect(language).toHaveValue("en");
    let requests = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const endpoint = "**/api/actions/createExerciseAliasAction";
    await page.route(endpoint, async (route) => {
      requests++;
      await gate;
      await route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_ERROR", requestId: "context" } },
      });
    });
    await form
      .getByRole("button", { name: t("addAlias"), exact: true })
      .click();
    await expect.poll(() => requests).toBe(1);
    await trigger.click();
    await trigger.click();
    await expect(form).toHaveAttribute("aria-busy", "true");
    await expect(
      form.getByRole("button", { name: t("addAlias"), exact: true }),
    ).toBeDisabled();
    await form.evaluate((element) =>
      (element as HTMLFormElement).requestSubmit(),
    );
    expect(requests).toBe(1);
    await trigger.click();
    release();
    await expect(form.getByRole("alert")).toHaveText(t("saveFailed"));
    await expect(alias).toBeVisible();
    await trigger.click();
    await trigger.click();
    await expect(form.getByRole("alert")).toHaveText(t("saveFailed"));
    await expect(alias).toHaveValue(draft);
    await page.unroute(endpoint);
    await alias.fill(`${draft} corrected`);
    await form
      .getByRole("button", { name: t("addAlias"), exact: true })
      .click();
    await expect(row.locator(".alias-list")).toContainText(
      `${draft} corrected`,
    );
    await expect(form).toHaveAttribute("aria-busy", "false");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await form
      .getByRole("button", { name: t("addAlias"), exact: true })
      .click();
    await expect(page).toHaveURL(/error=alias/);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      t("duplicateAlias"),
    );
    expect(
      await prisma.exerciseAlias.count({
        where: { exerciseId, alias: `${draft} corrected` },
      }),
    ).toBe(1);
    await page.screenshot({
      path: `${evidence}/context-alias-${locale}-green.png`,
      fullPage: true,
    });
  }
});
