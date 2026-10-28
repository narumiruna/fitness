import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

async function fixture(page: Page, longSession = false) {
  const key = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `training-entry-${key}`,
      passwordHash: await bcrypt.hash("fixture-password", 4),
    },
  });
  const other = await prisma.user.create({
    data: {
      username: `training-other-${key}`,
      passwordHash: user.passwordHash,
    },
  });
  const exercise = await prisma.exercise.create({
    data: {
      slug: key,
      defaultName: "Training fixture press",
      createdByUserId: user.id,
    },
  });
  const session = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2020, 0, 1),
      title: "Ongoing fixture",
      state: longSession ? "ACTIVE" : "PAUSED",
      resumedAt: longSession ? new Date() : null,
      restDeadline: longSession ? new Date(Date.now() + 90_000) : null,
      sets: {
        create: Array.from({ length: longSession ? 24 : 3 }, (_, i) => ({
          exerciseId: exercise.id,
          order: i + 1,
          weight: i === 0 ? 20 : 0,
          reps: i === 0 ? 8 : 1,
          targetWeight: 20,
          targetReps: 8,
          completed: i === 0,
          actualsEntered: i === 0,
        })),
      },
    },
  });
  await prisma.workout.create({
    data: {
      userId: other.id,
      date: new Date(),
      title: "Foreign ongoing fixture",
      state: "ACTIVE",
    },
  });
  if (!longSession)
    await prisma.workout.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        userId: user.id,
        date: new Date(2025, 0, i + 1),
        title: `History fixture ${i}`,
      })),
    });
  const templates = [];
  if (!longSession)
    for (const title of ["Fixture push", "Fixture pull"]) {
      templates.push(
        await prisma.workoutTemplate.create({
          data: {
            userId: user.id,
            title,
            sets: {
              create: {
                exerciseId: exercise.id,
                order: 1,
                weight: 20,
                reps: 8,
              },
            },
          },
        }),
      );
    }
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  return {
    user,
    session,
    templates,
    async dispose() {
      await prisma.user.deleteMany({
        where: { id: { in: [user.id, other.id] } },
      });
      await prisma.exercise.delete({ where: { id: exercise.id } });
    },
  };
}

async function setLocale(page: Page, locale: "en" | "zh-TW") {
  await page
    .context()
    .addCookies([
      { name: "locale", value: locale, url: new URL(page.url()).origin },
    ]);
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

test("training entry survives history filters and pagination, and template start retains drafts and request keys", async ({
  page,
}, info) => {
  const data = await fixture(page);
  let release = () => {};
  try {
    for (const locale of ["en", "zh-TW"] as const) {
      const t = dictionary(locale);
      await setLocale(page, locale);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/workouts");
        const entry = page.locator(".training-entry");
        await expect(
          entry.getByText("Ongoing fixture", { exact: true }),
        ).toBeVisible();
        await expect(entry).toContainText(
          t("sessionProgress")
            .replace("{completed}", "1")
            .replace("{total}", "3"),
        );
        await expect(
          entry.getByText("Foreign ongoing fixture", { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator(".selected-template")).toHaveCount(0);
        if (width === 390)
          await expect(
            page.locator(".workout-card h3").first(),
          ).toBeInViewport();
        await accessible(page);
        await page.screenshot({
          path: info.outputPath(`training-entry-${locale}-${width}.png`),
          animations: "disabled",
        });
      }
      await page.goto("/workouts?q=History&page=2");
      await expect(page.locator(".workout-card")).toHaveCount(5);
      await expect(
        page
          .locator(".training-entry")
          .getByRole("link", { name: t("continueTraining"), exact: true }),
      ).toHaveAttribute("href", `/workouts/${data.session.id}`);
      await page.goto("/workouts?q=no-matching-fixture");
      await expect(page.locator(".workout-card")).toHaveCount(0);
      await page
        .locator(".training-entry")
        .getByRole("link", { name: t("continueTraining"), exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/workouts/${data.session.id}$`));
      expect(
        (
          await prisma.workout.findUniqueOrThrow({
            where: { id: data.session.id },
          })
        ).state,
      ).toBe("PAUSED");
    }
    await prisma.workout.create({
      data: {
        userId: data.user.id,
        date: new Date(),
        title: "Additional ongoing fixture",
        state: "PAUSED",
      },
    });
    await setLocale(page, "en");
    await page.goto("/workouts");
    const otherSessions = page.locator(".training-entry details");
    await expect(otherSessions).not.toHaveAttribute("open");
    await otherSessions.locator("summary").click();
    await expect(
      otherSessions.getByText("Ongoing fixture", { exact: true }),
    ).toBeVisible();
    await otherSessions.locator("summary").click();
    await expect(otherSessions).not.toHaveAttribute("open");
    const before = await prisma.workout.count({
      where: { userId: data.user.id },
    });
    const picker = page.getByRole("combobox", {
      name: "Start from template",
      exact: true,
    });
    await picker.click();
    await page
      .getByRole("option", { name: "Fixture push", exact: true })
      .click();
    const start = page.locator(".selected-template:visible form");
    await expect(start).toBeVisible();
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(before);
    await start.getByLabel("Date", { exact: true }).fill("2026-10-20");
    await start
      .getByLabel("Rest duration (seconds)", { exact: true })
      .fill("120");
    const requestKey = await start.locator('input[name="key"]').inputValue();
    let writes = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/actions/startSessionAction",
      async (route) => {
        writes++;
        await route.fetch();
        await gate;
        await route.abort();
      },
      { times: 1 },
    );
    await start
      .getByRole("button", { name: "Start training", exact: true })
      .click();
    await expect(picker).toBeDisabled();
    await expect(
      start.getByRole("button", { name: "Start training", exact: true }),
    ).toBeDisabled();
    await expect
      .poll(() => prisma.workout.count({ where: { userId: data.user.id } }))
      .toBe(before + 1);
    release();
    await expect(start.getByRole("alert")).toContainText("Not saved");
    await expect(picker).toBeEnabled();
    await picker.click();
    await page
      .getByRole("option", { name: "Fixture pull", exact: true })
      .click();
    await expect(
      start.getByLabel("Rest duration (seconds)", { exact: true }),
    ).toHaveValue("90");
    await picker.click();
    await page
      .getByRole("option", { name: "Fixture push", exact: true })
      .click();
    await expect(start.locator('input[name="key"]')).toHaveValue(requestKey);
    await expect(start.getByRole("alert")).toContainText("Not saved");
    await expect(start.getByLabel("Date", { exact: true })).toHaveValue(
      "2026-10-20",
    );
    await expect(
      start.getByLabel("Rest duration (seconds)", { exact: true }),
    ).toHaveValue("120");
    expect(writes).toBe(1);
    await accessible(page);
    const alertBox = await start.getByRole("alert").boundingBox();
    const formBox = await start.boundingBox();
    const dateBox = await start
      .getByLabel("Date", { exact: true })
      .boundingBox();
    const restBox = await start
      .getByLabel("Rest duration (seconds)", { exact: true })
      .boundingBox();
    if (!alertBox || !formBox || !dateBox || !restBox)
      throw new Error("Missing template setup or feedback");
    expect(alertBox.width).toBeCloseTo(formBox.width, 0);
    expect(dateBox.y).toBeCloseTo(restBox.y, 0);
    await page.screenshot({
      path: info.outputPath("template-start-retry.png"),
      animations: "disabled",
    });
    await start
      .getByRole("button", { name: "Start training", exact: true })
      .click();
    await expect(page).toHaveURL(/\/workouts\/[^/]+$/);
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(before + 1);
    const created = await prisma.workout.findFirstOrThrow({
      where: { userId: data.user.id, templateId: data.templates[0].id },
    });
    expect(created.restSeconds).toBe(120);
    expect(created.state).toBe("ACTIVE");
  } finally {
    release();
    await data.dispose();
  }
});

test("long sessions keep progress, rest and controls beside the current set in both locales", async ({
  page,
}, info) => {
  const data = await fixture(page, true);
  try {
    for (const locale of ["en", "zh-TW"] as const) {
      const t = dictionary(locale);
      await setLocale(page, locale);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`/workouts/${data.session.id}`);
        const overview = page.locator(".session-overview");
        const current = page.locator('.session-set[data-current="true"]');
        await expect(page.locator(".session-set")).toHaveCount(24);
        await expect(overview).toContainText(
          t("sessionProgress")
            .replace("{completed}", "1")
            .replace("{total}", "24"),
        );
        expect(
          Number(
            await overview
              .getByRole("progressbar")
              .getAttribute("aria-valuenow"),
          ),
        ).toBeCloseTo(100 / 24);
        const statusBox = await overview.boundingBox();
        const setBox = await current.boundingBox();
        if (!statusBox || !setBox)
          throw new Error("Missing session status or current set");
        expect(setBox.y - (statusBox.y + statusBox.height)).toBeLessThanOrEqual(
          24,
        );
        expect(setBox.y).toBeGreaterThan(statusBox.y);
        await expect(
          overview.getByRole("button", { name: t("pause"), exact: true }),
        ).toBeVisible();
        await expect(
          current.getByRole("button", { name: t("complete"), exact: true }),
        ).toBeVisible();
        await accessible(page);
        await page.screenshot({
          path: info.outputPath(`training-session-${locale}-${width}.png`),
          animations: "disabled",
        });
      }
    }
    await setLocale(page, "en");
    await page.goto(`/workouts/${data.session.id}`);
    const current = page.locator('.session-set[data-current="true"]');
    await current.getByLabel("Weight (kg)", { exact: true }).fill("0");
    await current.getByLabel("Reps", { exact: true }).fill("1");
    await current
      .getByRole("button", { name: "Complete set", exact: true })
      .click();
    await expect(page.locator(".session-progress")).toContainText(
      "2/24 sets completed",
    );
    await page
      .locator(".session-overview")
      .getByRole("button", { name: "Pause", exact: true })
      .click();
    await expect(
      page
        .locator(".session-overview")
        .getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    await page
      .locator(".session-overview")
      .getByRole("button", { name: "Resume", exact: true })
      .click();
    await expect(
      page
        .locator(".session-overview")
        .getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
  } finally {
    await data.dispose();
    await prisma.$disconnect();
  }
});
