import { randomUUID } from "node:crypto";
import { parseDateKey } from "@narumitw/fitness-core/calendar";
import { test as base, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

const test = base.extend<{ userId: string }>({
  userId: async ({ page }, use) => {
    const user = await prisma.user.create({
      data: {
        username: `measurements-${randomUUID()}`,
        passwordHash: await bcrypt.hash("measurement-password", 4),
      },
    });
    try {
      await page.goto("/login");
      await page.getByLabel("Username", { exact: true }).fill(user.username);
      await page
        .getByLabel("Password", { exact: true })
        .fill("measurement-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workouts$/);
      await page.goto("/measurements");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Measurements",
      );
      await use(user.id);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  },
});

test.afterAll(async () => prisma.$disconnect());

function measurementForm(page: Page, dateLabel = "Date") {
  return page
    .locator("form")
    .filter({ has: page.getByLabel(dateLabel, { exact: true }) });
}

function measurementRow(page: Page, date: string) {
  return page
    .getByRole("row")
    .filter({ has: page.locator(`time[datetime="${date}"]`) });
}

async function expectNoPageOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
  }));
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
}

test("measurement validation preserves drafts and same-date saves replace one record", async ({
  page,
  userId,
}) => {
  const form = measurementForm(page);
  const save = form.getByRole("button", {
    name: "Save measurement",
    exact: true,
  });
  await expect(page.getByText("No measurements yet.")).toBeVisible();
  await form.getByLabel("Date").fill("2025-01-15");
  await save.click();
  await expect(form.getByRole("status")).toContainText("Not saved.");
  expect(await prisma.bodyMeasurement.count({ where: { userId } })).toBe(0);

  await form.getByLabel("Weight (kg)", { exact: true }).fill("75.25");
  await form.getByLabel("Waist (cm)", { exact: true }).fill("90.5");
  await save.click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  const row = measurementRow(page, "2025-01-15");
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(1)).toHaveText("75.25");
  await expect(row.getByRole("cell").nth(2)).toHaveText("90.5");
  const original = await prisma.bodyMeasurement.findFirstOrThrow({
    where: { userId },
  });

  // Bypass native validation to exercise the server validation boundary.
  await form.evaluate((element) => {
    (element as HTMLFormElement).noValidate = true;
  });
  await form.getByLabel("Weight (kg)", { exact: true }).fill("501");
  await save.click();
  await expect(form.getByRole("status")).toContainText("Not saved.");
  await expect(form.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "501",
  );
  await expect(row.getByRole("cell").nth(1)).toHaveText("75.25");
  expect(
    await prisma.bodyMeasurement.findUniqueOrThrow({
      where: { id: original.id },
    }),
  ).toMatchObject({ weight: 75.25, waist: 90.5 });

  await form.getByLabel("Weight (kg)", { exact: true }).fill("");
  await form.getByLabel("Waist (cm)", { exact: true }).fill("89.5");
  await save.click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(row.getByRole("cell").nth(1)).toHaveText("—");
  await expect(row.getByRole("cell").nth(2)).toHaveText("89.5");
  expect(await prisma.bodyMeasurement.findMany({ where: { userId } })).toEqual([
    expect.objectContaining({ id: original.id, weight: null, waist: 89.5 }),
  ]);
});

test("target weight persists after reload and can be cleared without deleting measurements", async ({
  page,
  userId,
}) => {
  const form = measurementForm(page);
  await form.getByLabel("Date").fill("2025-01-15");
  await form.getByLabel("Weight (kg)", { exact: true }).fill("75");
  await form
    .getByRole("button", { name: "Save measurement", exact: true })
    .click();
  await expect(form.getByRole("status")).toHaveText("Saved.");

  const editor = page.locator(".measurements-goal");
  await editor.locator("summary").click();
  const goal = editor.locator("form");
  await goal.getByLabel("Target weight (kg)").fill("70.5");
  await goal.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(goal.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await editor.locator("summary").click();
  await expect(goal.getByLabel("Target weight (kg)")).toHaveValue("70.5");
  await expect(page.locator(".chart-target")).toHaveText(
    "Target weight (kg): 70.5",
  );
  await expect(page.locator("svg").getByText(/Target weight/)).toHaveCount(0);
  await expect(page.locator('svg line[stroke-dasharray="5 5"]')).toHaveCount(1);

  await goal.getByLabel("Target weight (kg)").fill("");
  await goal.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(goal.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await editor.locator("summary").click();
  await expect(goal.getByLabel("Target weight (kg)")).toHaveValue("");
  await expect(page.locator(".chart-target")).toHaveCount(0);
  await expect(page.locator('svg line[stroke-dasharray="5 5"]')).toHaveCount(0);
  expect(await prisma.bodyGoal.findUnique({ where: { userId } })).toMatchObject(
    {
      weight: null,
    },
  );
  await expect(measurementRow(page, "2025-01-15")).toBeVisible();
  expect(await prisma.bodyMeasurement.count({ where: { userId } })).toBe(1);
});

test("measurement deletion supports cancellation and rejects another user's record ID", async ({
  page,
  userId,
}) => {
  const other = await prisma.user.create({
    data: {
      username: `measurements-other-${randomUUID()}`,
      passwordHash: await bcrypt.hash("measurement-password", 4),
    },
  });
  try {
    const own = await prisma.bodyMeasurement.create({
      data: { userId, date: parseDateKey("2025-01-15") as Date, weight: 75 },
    });
    const foreign = await prisma.bodyMeasurement.create({
      data: {
        userId: other.id,
        date: parseDateKey("2025-01-16") as Date,
        weight: 99,
      },
    });
    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(measurementRow(page, "2025-01-16")).toHaveCount(0);
    const row = measurementRow(page, "2025-01-15");
    const dialog = page.getByRole("alertdialog");
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.locator('input[name="id"]').evaluate((input, id) => {
      (input as HTMLInputElement).value = id;
    }, foreign.id);
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      await prisma.bodyMeasurement.count({ where: { id: foreign.id } }),
    ).toBe(1);
    await expect(row).toBeVisible();

    await page.reload();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("No measurements yet.")).toBeVisible();
    expect(await prisma.bodyMeasurement.count({ where: { id: own.id } })).toBe(
      0,
    );
    expect(
      await prisma.bodyMeasurement.count({ where: { id: foreign.id } }),
    ).toBe(1);
  } finally {
    await prisma.user.delete({ where: { id: other.id } });
  }
});

for (const locale of ["en", "zh-TW"] as const) {
  test(`Measurements entry, history, and expanded edits reflow at 320 in ${locale}`, async ({
    page,
    userId,
  }) => {
    const t = dictionary(locale);
    await page
      .context()
      .addCookies([
        { name: "locale", value: locale, url: new URL(page.url()).origin },
      ]);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t("measurements"),
    );
    const form = measurementForm(page, t("date"));
    await expect(form.getByLabel(t("date"))).toHaveAccessibleDescription(
      t("measurementDateHelp"),
    );
    await expect(form.getByLabel(t("weight"))).toHaveAccessibleDescription(
      t("measurementsHelp"),
    );
    await expect(
      form.getByRole("button", { name: t("saveMeasurement"), exact: true }),
    ).toBeVisible();
    await expect(page.getByText(t("noMeasurements"))).toBeVisible();
    await expectNoPageOverflow(page);

    const targetEditor = page.locator(".measurements-goal");
    await targetEditor.locator("summary").click();
    await expect(
      targetEditor.getByRole("button", { name: t("saveTarget"), exact: true }),
    ).toBeVisible();
    await expectNoPageOverflow(page);

    await prisma.bodyMeasurement.createMany({
      data: [
        {
          userId,
          date: parseDateKey("2025-01-15") as Date,
          weight: 75.25,
          waist: 90.5,
        },
        {
          userId,
          date: parseDateKey("2025-01-16") as Date,
          weight: 74.5,
          waist: 89.5,
        },
        { userId, date: parseDateKey("2025-01-17") as Date, weight: 74.2 },
      ],
    });
    await page.reload();
    const history = page.getByRole("region", {
      name: t("measurementHistoryTable"),
      exact: true,
    });
    await expect(
      history.getByRole("table", { name: t("measurementHistoryTable") }),
    ).toBeVisible();
    await expectNoPageOverflow(page);
    expect(
      await page.locator(".measurements-page").evaluate((section) => {
        const entry = section.querySelector(".measurements-entry");
        const history = section.querySelector(".measurements-history");
        const chart = section.querySelector(".training-chart");
        const goal = section.querySelector(".measurements-goal");
        return [entry, history, chart].every((element, index) =>
          Boolean(
            element &&
              [history, chart, goal][index] &&
              element.compareDocumentPosition(
                [history, chart, goal][index] as Element,
              ) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        );
      }),
    ).toBe(true);
    await history.focus();
    await expect(history).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => history.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);

    const row = measurementRow(page, "2025-01-15");
    const summary = row.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(row.locator("details")).toHaveAttribute("open", "");
    const edit = row.locator("details form");
    await expect(edit.getByLabel(t("weight"))).toHaveValue("75.25");
    await expect(edit.getByLabel(t("waist"))).toHaveValue("90.5");
    await expectNoPageOverflow(page);
    await edit.evaluate((element) => {
      (element as HTMLFormElement).noValidate = true;
    });
    await edit.getByLabel(t("weight")).fill("501");
    const save = edit.getByRole("button", {
      name: t("saveMeasurement"),
      exact: true,
    });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(edit.getByRole("status")).toHaveText(t("saveFailed"));
    await expect(edit.getByLabel(t("weight"))).toHaveValue("501");
    await expect(row.locator("details")).toHaveAttribute("open", "");
    await expectNoPageOverflow(page);

    await edit.getByLabel(t("weight")).fill("75.5");
    await edit.getByRole("button", { name: t("cancel"), exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(row.locator("details")).not.toHaveAttribute("open");
    await expect(summary).toBeFocused();
    await expect(row.getByRole("cell").nth(1)).toHaveText("75.25");
    await page.keyboard.press("Enter");
    await expect(edit.getByLabel(t("weight"))).toHaveValue("75.5");
    await edit.getByLabel(t("waist")).fill("");
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(row.getByRole("cell").nth(1)).toHaveText("75.5");
    await expect(row.getByRole("cell").nth(2)).toHaveText("—");
    await page.reload();
    await expect(row.getByRole("cell").nth(1)).toHaveText("75.5");
    await expectNoPageOverflow(page);
    expect(await prisma.bodyMeasurement.count({ where: { userId } })).toBe(3);
  });

  for (const fixture of [
    { name: "close-to-target", values: [70.19, 70.21], target: 70.2 },
    { name: "sparse", values: [72], target: 72 },
    {
      name: "long target value",
      values: [499.1234567890123],
      target: 499.1234567890122,
    },
  ]) {
    test(`${fixture.name} chart reserves target-label space in ${locale}`, async ({
      page,
      userId,
    }) => {
      const t = dictionary(locale);
      await prisma.bodyMeasurement.createMany({
        data: fixture.values.map((weight, index) => ({
          userId,
          date: parseDateKey(`2025-01-${15 + index}`) as Date,
          weight,
        })),
      });
      await prisma.bodyGoal.create({
        data: { userId, weight: fixture.target },
      });
      await page
        .context()
        .addCookies([
          { name: "locale", value: locale, url: new URL(page.url()).origin },
        ]);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        const chart = page.locator(".training-chart").first();
        const target = chart.locator(".chart-target");
        await expect(target).toHaveText(
          `${t("goal")}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(fixture.target)}`,
        );
        await expectNoPageOverflow(page);
        const targetBounds = await target.boundingBox();
        const plotBounds = await chart.locator("svg").boundingBox();
        const entryBounds = await page
          .locator(".measurements-entry")
          .boundingBox();
        expect(targetBounds).not.toBeNull();
        expect(plotBounds).not.toBeNull();
        expect(entryBounds).not.toBeNull();
        if (!targetBounds || !plotBounds || !entryBounds)
          throw new Error("Missing chart bounds");
        expect(targetBounds.y + targetBounds.height).toBeLessThanOrEqual(
          plotBounds.y,
        );
        expect(targetBounds.x).toBeGreaterThanOrEqual(0);
        expect(targetBounds.x + targetBounds.width).toBeLessThanOrEqual(width);
        expect(plotBounds.width).toBeLessThanOrEqual(768);
        expect(entryBounds.width).toBeLessThanOrEqual(576);
        await expect(chart.locator("svg").getByText(t("goal"))).toHaveCount(0);
        await expect(chart.locator('line[stroke-dasharray="5 5"]')).toHaveCount(
          1,
        );
        await expect(chart.locator("g[role=button]")).toHaveCount(
          fixture.values.length,
        );
        await chart.locator(".chart-data summary").focus();
        await page.keyboard.press("Enter");
        await expect(chart.locator(".chart-data dl")).toBeVisible();
        await expect(chart.locator(".chart-data-row")).toHaveCount(
          fixture.values.length,
        );
        const point = chart.locator("g[role=button]").first();
        await point.focus();
        await page.keyboard.press("Enter");
        await expect(chart.locator(".chart-tooltip")).not.toHaveText("\u00a0");
        await expect(
          page.getByRole("table", { name: t("measurementHistoryTable") }),
        ).toBeVisible();
        await expectNoPageOverflow(page);
      }
    });
  }
}
