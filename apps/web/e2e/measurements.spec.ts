import { randomUUID } from "node:crypto";
import { parseDateKey } from "@narumitw/fitness-core/calendar";
import { test as base, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";

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

function measurementForm(page: Page) {
  return page.locator("form").filter({ has: page.getByLabel("Date") });
}

function measurementRow(page: Page, date: string) {
  return page
    .getByRole("row")
    .filter({ has: page.locator(`time[datetime="${date}"]`) });
}

test("measurement validation preserves drafts and same-date saves replace one record", async ({
  page,
  userId,
}) => {
  const form = measurementForm(page);
  await expect(page.getByText("No measurements yet.")).toBeVisible();
  await form.getByLabel("Date").fill("2025-01-15");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("Not saved.");
  expect(await prisma.bodyMeasurement.count({ where: { userId } })).toBe(0);

  await form.getByLabel("Weight (kg)", { exact: true }).fill("75.25");
  await form.getByLabel("Waist (cm)", { exact: true }).fill("90.5");
  await form.getByRole("button", { name: "Save", exact: true }).click();
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
  await form.getByRole("button", { name: "Save", exact: true }).click();
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
  await form.getByRole("button", { name: "Save", exact: true }).click();
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
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");

  const goal = page
    .locator("form")
    .filter({ has: page.getByLabel("Target weight (kg)", { exact: true }) });
  await goal.getByLabel("Target weight (kg)").fill("70.5");
  await goal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(goal.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(goal.getByLabel("Target weight (kg)")).toHaveValue("70.5");
  await expect(
    page.locator("svg").getByText("Target weight (kg): 70.5", { exact: true }),
  ).toBeVisible();

  await goal.getByLabel("Target weight (kg)").fill("");
  await goal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(goal.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(goal.getByLabel("Target weight (kg)")).toHaveValue("");
  await expect(page.locator("svg").getByText(/Target weight/)).toHaveCount(0);
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
