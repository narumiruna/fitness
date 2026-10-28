import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import type { Locale } from "../src/lib/locales";
import { dictionary } from "../src/lib/translations";

async function fixture(page: Page) {
  const key = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `result-review-${key}`,
      passwordHash: await bcrypt.hash("fixture-password", 4),
    },
  });
  const other = await prisma.user.create({
    data: { username: `result-other-${key}`, passwordHash: user.passwordHash },
  });
  const exercise = await prisma.exercise.create({
    data: { slug: key, defaultName: "Fixture Press", createdByUserId: user.id },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2026, 9, 21),
      title: "Upper body results",
      notes: "Synthetic workout notes.",
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            weight: 20,
            reps: 10,
            type: "WARMUP",
            notes: "Warm-up recorded",
          },
          {
            exerciseId: exercise.id,
            order: 2,
            weight: 50.251,
            reps: 8,
            rir: 1.5,
            notes: "Controlled tempo",
          },
          { exerciseId: exercise.id, order: 3, weight: 0, reps: 12, rir: 0 },
          {
            exerciseId: exercise.id,
            order: 4,
            weight: 999,
            reps: 99,
            completed: false,
            actualsEntered: false,
          },
        ],
      },
    },
    include: { sets: { orderBy: { order: "asc" } } },
  });
  await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2026, 9, 1),
      title: "Earlier results",
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 45.5, reps: 10 },
      },
    },
  });
  await prisma.workout.create({
    data: {
      userId: other.id,
      date: new Date(2026, 9, 22),
      title: "Foreign results",
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 900, reps: 42 },
      },
    },
  });
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  return {
    user,
    other,
    exercise,
    workout,
    async dispose() {
      await prisma.user.deleteMany({
        where: { id: { in: [user.id, other.id] } },
      });
      await prisma.exercise.delete({ where: { id: exercise.id } });
    },
  };
}

async function language(page: Page, locale: Locale) {
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
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("result-review layouts show saved values before editors and offer read-only history details", async ({
  page,
}, info) => {
  const data = await fixture(page);
  const measurements = [];
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/actions/"))
      writes++;
  });
  try {
    for (const locale of ["en", "zh-TW"] as const) {
      const t = dictionary(locale);
      await language(page, locale);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const [name, path] of [
          ["workout", `/workouts/${data.workout.id}`],
          ["exercise", `/exercises/${data.exercise.id}`],
        ]) {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          if (name === "workout") {
            const rows = page.locator(".recorded-set-list > .recorded-set");
            await expect(rows).toHaveCount(4);
            await expect(
              rows.locator(
                'input:not([type="hidden"]):visible, textarea:visible, [role="combobox"]:visible',
              ),
            ).toHaveCount(0);
            await expect(rows.nth(1).locator(".set-result")).toContainText(
              "50.251 kg × 8",
            );
            await expect(rows.nth(1).locator(".set-result")).toContainText(
              `${t("rir")}: 1.5`,
            );
            await expect(rows.nth(1)).toContainText("Controlled tempo");
            await expect(rows.nth(2).locator(".set-result")).toContainText(
              "0 kg × 12",
            );
            await expect(rows.nth(2)).toContainText(`${t("rir")}: 0`);
            await expect(rows.nth(3)).toContainText(t("skipped"));
            await expect(rows.nth(3)).not.toContainText(/\b999\b|\b99\b|kg/);
            await expect(
              rows
                .nth(3)
                .locator("details, input:not([type=hidden]), textarea"),
            ).toHaveCount(0);
            const summary = rows.nth(1).locator("summary");
            await summary.focus();
            await page.keyboard.press("Enter");
            await expect(
              rows.nth(1).getByLabel(t("weight"), { exact: true }),
            ).toHaveValue("50.251");
            await page.keyboard.press("Enter");
            await expect(rows.nth(1).locator("details")).not.toHaveAttribute(
              "open",
            );
            if (width === 390) await expect(rows.first()).toBeInViewport();
          } else {
            const records = page.getByRole("region", {
              name: t("workingSetRecords"),
              exact: true,
            });
            await expect(records.locator(".stats-card")).toHaveCount(2);
            await expect(records).toContainText("50.251 kg");
            await expect(records).not.toContainText("50.3 kg");
            await expect(page.locator(".exercise-totals")).not.toHaveAttribute(
              "open",
            );
            await expect(page.locator(".exercise-history-entry")).toHaveCount(
              2,
            );
            await expect(page.locator("main")).not.toContainText(
              "Foreign results",
            );
            if (width === 390)
              await expect(page.locator(".agenda-item").first()).toBeInViewport(
                { ratio: 1 },
              );
          }
          await accessible(page);
          const firstHistory = page.locator(".agenda-item").first();
          measurements.push({
            name,
            locale,
            width,
            visibleInputs: await page
              .locator('main input:not([type="hidden"]):visible')
              .count(),
            firstHistoryTop: (await firstHistory.count())
              ? await firstHistory.evaluate(
                  (el) => el.getBoundingClientRect().top,
                )
              : null,
          });
          await page.screenshot({
            path: info.outputPath(`${name}-${locale}-${width}.png`),
            fullPage: true,
            animations: "disabled",
          });
          await page.screenshot({
            path: info.outputPath(`${name}-${locale}-${width}-viewport.png`),
            animations: "disabled",
          });
          if (name === "exercise") {
            const entry = page.locator(".exercise-history-entry").first();
            await expect(entry.locator(".agenda-item")).toHaveAttribute(
              "href",
              `/workouts/${data.workout.id}`,
            );
            await expect(entry.locator("time")).toHaveAttribute(
              "datetime",
              "2026-10-21",
            );
            await entry.locator("summary").focus();
            await page.keyboard.press("Enter");
            await expect(entry.locator(".history-set")).toHaveCount(3);
            await expect(entry).toContainText("50.251 kg × 8");
            await expect(entry).toContainText("0 kg × 12");
            await expect(entry).toContainText("Controlled tempo");
            await expect(entry).not.toContainText(/\b999\b|\b900\b/);
            await expect(
              entry.locator("input, textarea, [role=combobox], form"),
            ).toHaveCount(0);
            await accessible(page);
            await page.screenshot({
              path: info.outputPath(`history-expanded-${locale}-${width}.png`),
              animations: "disabled",
            });
            await page.locator(".exercise-totals > summary").click();
            await expect(
              page.locator(".exercise-totals .stats-card"),
            ).toHaveCount(4);
            await expect(page.locator(".exercise-totals")).toContainText(
              "1,057",
            );
            await expect(page.locator(".exercise-totals")).toContainText("857");
            await accessible(page);
          }
        }
      }
    }
    expect(writes).toBe(0);
    const path = info.outputPath("layout-measurements.json");
    await writeFile(path, JSON.stringify(measurements, null, 2));
    await info.attach("layout-measurements", {
      path,
      contentType: "application/json",
    });
  } finally {
    await data.dispose();
  }
});

test("a single recorded-set editor keeps drafts across disclosure, resize and failed responses", async ({
  page,
}) => {
  const data = await fixture(page);
  let release = () => {};
  try {
    for (const locale of ["en", "zh-TW"] as const) {
      const t = dictionary(locale);
      await language(page, locale);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/workouts/${data.workout.id}`);
      const row = page.locator(`[data-set-id="${data.workout.sets[1].id}"]`);
      const editor = row.locator("details");
      await editor.locator("summary").click();
      await row.getByLabel(t("weight"), { exact: true }).fill("50.252");
      await row
        .getByLabel(t("notes"), { exact: true })
        .fill("Uncommitted correction");
      await editor.locator("summary").click();
      await page.setViewportSize({ width: 390, height: 844 });
      await editor.locator("summary").click();
      await expect(row.getByLabel(t("weight"), { exact: true })).toHaveValue(
        "50.252",
      );
      await expect(row.getByLabel(t("notes"), { exact: true })).toHaveValue(
        "Uncommitted correction",
      );
      await expect(
        page.locator(`input[name="setId"][value="${data.workout.sets[1].id}"]`),
      ).toHaveCount(1);
      await row.getByLabel(t("weight"), { exact: true }).fill("");
      await editor.locator("summary").click();
      await row
        .locator("form")
        .evaluate((el: HTMLFormElement) => el.requestSubmit());
      await expect(editor).toHaveAttribute("open", "");
      await row.getByLabel(t("weight"), { exact: true }).fill("50.252");
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writes = 0;
      await page.route(
        "**/api/actions/updateWorkoutSetAction",
        async (route) => {
          writes++;
          await gate;
          await route.fulfill({ status: 503, json: {} });
        },
        { times: 1 },
      );
      await row
        .getByRole("button", { name: t("updateSet"), exact: true })
        .click();
      await expect(row.locator("form")).toHaveAttribute("aria-busy", "true");
      await editor.locator("summary").click();
      release();
      await expect(editor).toHaveAttribute("open", "");
      await expect(row.getByRole("alert")).toBeVisible();
      await expect(row.getByLabel(t("weight"), { exact: true })).toHaveValue(
        "50.252",
      );
      await expect(row.getByLabel(t("notes"), { exact: true })).toHaveValue(
        "Uncommitted correction",
      );
      await expect(row.locator(".set-result")).toContainText("50.251 kg × 8");
      expect(writes).toBe(1);
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(row.getByLabel(t("weight"), { exact: true })).toHaveValue(
        "50.252",
      );
      await row
        .getByRole("button", { name: t("updateSet"), exact: true })
        .click();
      await expect(row.locator(".set-result")).toContainText("50.252 kg × 8");
      await expect(editor).not.toHaveAttribute("open");
      expect(
        (
          await prisma.workoutSet.findUniqueOrThrow({
            where: { id: data.workout.sets[1].id },
          })
        ).weight,
      ).toBe(50.252);
      // Restore the fixture before the next locale without changing test intent.
      await prisma.workoutSet.update({
        where: { id: data.workout.sets[1].id },
        data: { weight: 50.251, notes: "Controlled tempo" },
      });
    }
  } finally {
    release();
    await data.dispose();
  }
});

test("warm-up-only and foreign-only history do not fabricate working records or expose editors", async ({
  page,
}) => {
  const data = await fixture(page);
  const extraIds: string[] = [];
  try {
    const warmup = await prisma.exercise.create({
      data: {
        slug: randomUUID(),
        defaultName: "Shared warm-up movement",
        createdByUserId: data.other.id,
      },
    });
    const empty = await prisma.exercise.create({
      data: {
        slug: randomUUID(),
        defaultName: "Foreign-only movement",
        createdByUserId: data.other.id,
      },
    });
    extraIds.push(warmup.id, empty.id);
    await prisma.workout.create({
      data: {
        userId: data.user.id,
        date: new Date(),
        title: "Warm-up only",
        sets: {
          create: [
            {
              exerciseId: warmup.id,
              order: 1,
              weight: 0.001,
              reps: 1,
              type: "WARMUP",
            },
            {
              exerciseId: warmup.id,
              order: 2,
              weight: 999,
              reps: 99,
              completed: false,
              actualsEntered: false,
            },
          ],
        },
      },
    });
    await prisma.workout.create({
      data: {
        userId: data.other.id,
        date: new Date(),
        title: "Foreign working records",
        sets: {
          create: [warmup.id, empty.id].map((exerciseId, i) => ({
            exerciseId,
            order: i + 1,
            weight: 900,
            reps: 42,
          })),
        },
      },
    });
    await page.setViewportSize({ width: 320, height: 844 });
    for (const locale of ["en", "zh-TW"] as const) {
      const t = dictionary(locale);
      await language(page, locale);
      await page.goto(`/exercises/${warmup.id}`);
      await expect(page.locator(".exercise-records")).toHaveCount(0);
      await expect(page.locator(".exercise-history-entry")).toHaveCount(1);
      await page.locator(".exercise-history-entry summary").click();
      await expect(page.locator(".history-set")).toHaveCount(1);
      await expect(page.locator(".history-set")).toContainText("0.001 kg × 1");
      await expect(page.locator("main")).not.toContainText(
        "Foreign working records",
      );
      await expect(
        page.locator("#edit-exercise, #edit-exercise-metadata"),
      ).toHaveCount(0);
      await accessible(page);
      await page.goto(`/exercises/${empty.id}`);
      await expect(
        page.getByText(t("noExerciseHistory"), { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(
          ".exercise-records, .exercise-totals, .exercise-history-entry",
        ),
      ).toHaveCount(0);
      await expect(
        page.locator("#edit-exercise, #edit-exercise-metadata"),
      ).toHaveCount(0);
      await accessible(page);
    }
  } finally {
    try {
      await data.dispose();
    } finally {
      await prisma.exercise.deleteMany({ where: { id: { in: extraIds } } });
    }
  }
});

test("saved results and expanded corrections reflow at real 200 percent Chrome zoom", async ({
  page,
  context,
}, info) => {
  const data = await fixture(page);
  const directory = await mkdtemp(join(tmpdir(), "fitness-results-zoom-"));
  let zoomContext: import("@playwright/test").BrowserContext | undefined;
  try {
    const origin = new URL(page.url()).origin;
    zoomContext = await chromium.launchPersistentContext(directory, {
      channel: "chrome",
      headless: true,
      viewport: null,
      baseURL: origin,
      ignoreHTTPSErrors: true,
      args: ["--window-size=1440,900"],
    });
    await zoomContext.addCookies(await context.cookies());
    const zoom = await zoomContext.newPage();
    await zoom.goto("chrome://settings/appearance");
    await zoom.locator("#zoomLevel").selectOption("2", { force: true });
    await expect(zoom.locator("#zoomLevel")).toHaveValue("2");
    for (const locale of ["en", "zh-TW"] as const) {
      await zoom.goto(origin);
      await language(zoom, locale);
      for (const [name, path] of [
        ["workout", `/workouts/${data.workout.id}`],
        ["exercise", `/exercises/${data.exercise.id}`],
      ]) {
        await zoom.goto(path);
        expect(await zoom.evaluate(() => devicePixelRatio)).toBe(2);
        expect(await zoom.evaluate(() => innerWidth)).toBeLessThanOrEqual(720);
        await expect(zoom.getByRole("heading", { level: 1 })).toBeVisible();
        if (name === "workout") {
          await zoom.locator(".recorded-set-editor summary").nth(1).click();
          await expect(
            zoom.locator(".recorded-set-editor[open] input[name=weight]"),
          ).toHaveValue("50.251");
        } else {
          await zoom.locator(".exercise-history-entry summary").first().click();
          await zoom.locator(".exercise-totals summary").click();
          await expect(
            zoom.locator(".exercise-history-sets[open] .history-set"),
          ).toHaveCount(3);
        }
        await accessible(zoom);
        const session = await zoomContext.newCDPSession(zoom);
        try {
          const { data: png } = await session.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
            fromSurface: true,
          });
          await writeFile(
            info.outputPath(`${name}-${locale}-zoom200.png`),
            Buffer.from(png, "base64"),
          );
        } finally {
          await session.detach();
        }
      }
    }
  } finally {
    await zoomContext?.close();
    await rm(directory, { recursive: true, force: true });
    await data.dispose();
    await prisma.$disconnect();
  }
});
