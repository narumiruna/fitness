import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { chromium, expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

async function fixture(page: Page) {
  const key = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `remediation-${key}`,
      passwordHash: await bcrypt.hash("fixture-password", 4),
      role: "ADMIN",
    },
  });
  const exercise = await prisma.exercise.create({
    data: {
      slug: `remediation-${key}`,
      defaultName: "Fixture Press / 測試臥推",
      createdByUserId: user.id,
    },
  });
  const today = new Date();
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      title: "Recorded workout / 已完成訓練",
      notes: "Synthetic notes. ".repeat(40),
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 20, reps: 8 },
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
    exercise,
    workout,
    async dispose() {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.exercise.delete({ where: { id: exercise.id } });
    },
  };
}

test("supporting screens put content before secondary tools in both locales and viewports", async ({
  page,
}, info) => {
  const data = await fixture(page);
  try {
    for (const language of ["en", "zh-TW"] as const) {
      await page
        .context()
        .addCookies([
          { name: "locale", value: language, url: new URL(page.url()).origin },
        ]);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 844,
        });
        for (const route of [
          "workouts",
          "exercises",
          "source",
          "calendar",
          "stats",
          "data",
          "admin/users",
        ]) {
          await page.goto(`/${route}`);
          await expect(page.locator("main h1")).toBeVisible();
          await expect(page.locator("main .rt-Spinner")).toHaveCount(0);
          if (route === "workouts" || route === "exercises") {
            const result = page
              .locator(
                route === "workouts" ? ".workout-card h3" : ".exercise-row h3",
              )
              .first();
            await expect(result).toBeVisible();
            if (width === 390) await expect(result).toBeInViewport();
            await expect(
              page.getByLabel(language === "en" ? "Search" : "搜尋", {
                exact: true,
              }),
            ).toBeVisible();
          }
          if (route === "source") {
            const links = page.locator("main a");
            await expect(links).toHaveCount(2);
            await expect(links.nth(0)).toHaveAttribute(
              "href",
              "https://github.com/narumiruna/fitness",
            );
            await expect(links.nth(1)).toHaveAttribute(
              "href",
              /github\.com\/narumiruna\/fitness\/blob\/main\/LICENSE$/,
            );
          }
          if (route === "calendar") {
            await expect(
              page.getByRole("link", {
                name: language === "en" ? "Previous month" : "上個月",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              page.getByRole("link", {
                name: language === "en" ? "Next month" : "下個月",
                exact: true,
              }),
            ).toBeVisible();
            await expect(page.locator(".selected-workout")).toContainText(
              language === "en" ? "Completed" : "已完成",
            );
            expect(
              await page
                .locator(".calendar-note-preview")
                .evaluate((el) => el.scrollHeight > el.clientHeight),
            ).toBe(true);
            await expect(
              page.locator(".selected-date-panel a").last(),
            ).toHaveAttribute(
              "href",
              `/workouts/new?date=${formatDateKey(data.workout.date)}`,
            );
          }
          if (route === "stats") {
            const chart = await page
              .locator(".training-chart")
              .first()
              .boundingBox();
            const overview = await page
              .locator(".stats-card-grid")
              .boundingBox();
            if (!chart || !overview)
              throw new Error("Missing chart or overview");
            expect(chart.y).toBeLessThan(overview.y);
            await expect(page.locator(".stats-card-grid")).toContainText(
              language === "en" ? "kg × reps" : "kg × 次數",
            );
            const point = page
              .locator(".training-chart g[role=button]")
              .first();
            await point.focus();
            await page.keyboard.press("Enter");
            await expect(page.locator(".chart-tooltip").first()).toContainText(
              "160",
            );
            await page.locator(".chart-data summary").first().click();
            await expect(page.locator(".chart-data dd").first()).toHaveText(
              "160",
            );
          }
          if (route === "data") {
            const preview = page.getByRole("button", {
              name: language === "en" ? "Preview" : "預覽",
              exact: true,
            });
            await expect(preview).toBeDisabled();
            const style = await preview.evaluate((el) => ({
              background: getComputedStyle(el).backgroundColor,
              disabled: el.matches(":disabled"),
            }));
            expect(style.disabled).toBe(true);
            expect(style.background).not.toBe("rgb(8, 117, 101)");
          }
          if (route === "admin/users") {
            await expect(page.locator(".admin-create")).not.toHaveAttribute(
              "open",
            );
            await expect(page.locator("main table")).toContainText(
              language === "en" ? "Administrator" : "管理員",
            );
            const table = await page.locator("main table").boundingBox();
            const tools = await page.locator(".admin-create").boundingBox();
            if (!table || !tools) throw new Error("Missing user list or tools");
            expect(table.y).toBeLessThan(tools.y);
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${route}-${language}-${width} reflow`,
          ).toBe(true);
          expect(
            (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
            `${route}-${language}-${width} axe`,
          ).toEqual([]);
          await page.screenshot({
            path: info.outputPath(
              `${route.replaceAll("/", "-")}-${language}-${width}.png`,
            ),
            animations: "disabled",
          });
        }
      }
    }
  } finally {
    await data.dispose();
    await prisma.$disconnect();
  }
});

test("import stages keep preview and cancellation read-only and recover from failed confirmation", async ({
  page,
  context,
}) => {
  const data = await fixture(page);
  try {
    await page.goto("/data");
    const csv = await (await context.request.get("/data/export")).text();
    const count = await prisma.workout.count({
      where: { userId: data.user.id },
    });
    const file = page.getByLabel("CSV file");
    const preview = page.getByRole("button", { name: "Preview", exact: true });
    await expect(preview).toBeDisabled();
    await file.setInputFiles({
      name: "fixture.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await expect(preview).toBeEnabled();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/actions/previewImportAction",
      async (route) => {
        await gate;
        await route.continue();
      },
      { times: 1 },
    );
    await preview.click();
    await expect(preview).toBeDisabled();
    await expect(file).toBeDisabled();
    release();
    const confirm = page.getByRole("button", {
      name: "Confirm import",
      exact: true,
    });
    await expect(confirm).toBeEnabled();
    await expect(preview).toHaveCount(0);
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(count);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(file).toBeEnabled();
    await expect(preview).toBeEnabled();
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(count);
    await preview.click();
    await expect(confirm).toBeEnabled();
    await page.route(
      "**/api/actions/confirmImportAction",
      (route) => route.abort(),
      { times: 1 },
    );
    await confirm.click();
    await expect(page.getByRole("status")).toContainText("Not saved");
    await expect(confirm).toBeEnabled();
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(count);
    await confirm.click();
    await expect(page.getByRole("status")).toContainText("Imported: 0");
    await expect(confirm).toHaveCount(0);
    await expect(preview).toBeDisabled();
    await expect(file).toHaveValue("");
    expect(
      await prisma.workout.count({ where: { userId: data.user.id } }),
    ).toBe(count);
    await file.setInputFiles({
      name: "oversize.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.getByRole("status")).toContainText("Invalid app CSV");
    await expect(preview).toBeDisabled();
    await page.evaluate(() => {
      File.prototype.text = () =>
        Promise.reject(new Error("Synthetic file read failure"));
    });
    await file.setInputFiles({
      name: "unreadable.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await expect(page.getByRole("status")).toContainText("Invalid app CSV");
    await expect(preview).toBeDisabled();
  } finally {
    await data.dispose();
    await prisma.$disconnect();
  }
});

test("deferred editors reveal invalid fields and failed saves without losing drafts", async ({
  page,
}) => {
  const data = await fixture(page);
  const active = await prisma.workout.create({
    data: {
      userId: data.user.id,
      date: new Date(),
      state: "ACTIVE",
      resumedAt: new Date(),
      sets: {
        create: {
          exerciseId: data.exercise.id,
          order: 1,
          weight: 0,
          reps: 1,
          targetWeight: 20,
          targetReps: 8,
          completed: false,
          actualsEntered: false,
        },
      },
    },
  });
  async function failClosed(
    details: import("@playwright/test").Locator,
    action: string,
    button: string,
    failure: string,
  ) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const pattern = `**/api/actions/${action}`;
    await page.route(pattern, async (route) => {
      writes++;
      await gate;
      await route.abort();
    });
    const form = details.locator("form");
    try {
      await form.getByRole("button", { name: button, exact: true }).click();
      await expect(form).toHaveAttribute("aria-busy", "true");
      await details.locator(":scope > summary").click();
      await expect(details).not.toHaveAttribute("open");
      release();
      await expect(details).toHaveAttribute("open", "");
      await expect(
        form.locator('[role="status"], [role="alert"]'),
      ).toContainText(failure);
      expect(writes).toBe(1);
    } finally {
      release();
      await page.unroute(pattern);
    }
  }
  try {
    for (const language of ["en", "zh-TW"] as const) {
      const t = dictionary(language);
      await page
        .context()
        .addCookies([
          { name: "locale", value: language, url: new URL(page.url()).origin },
        ]);
      await page.goto(`/workouts/${active.id}`);
      const current = page.locator(".session-set").first();
      const form = current.locator("form");
      await form.locator('[name="weight"]').fill("0");
      await form.locator('[name="reps"]').fill("1");
      await form.locator("details > summary").click();
      const rir = form.locator('[name="rir"]');
      await rir.fill("11");
      await form.locator("details > summary").click();
      let writes = 0;
      const observe = (request: import("@playwright/test").Request) => {
        if (new URL(request.url()).pathname.endsWith("/editSessionSetAction"))
          writes++;
      };
      page.on("request", observe);
      await form
        .getByRole("button", { name: t("complete"), exact: true })
        .click();
      await expect(rir).toBeVisible();
      await expect(rir).toBeFocused();
      expect(writes).toBe(0);
      page.off("request", observe);
      await rir.fill("2");
      await failClosed(
        current,
        "editSessionSetAction",
        t("save"),
        t("saveFailed"),
      );
      await expect(form.locator('[name="weight"]')).toHaveValue("0");
      await expect(rir).toHaveValue("2");
      expect(
        (await prisma.workout.findUniqueOrThrow({ where: { id: active.id } }))
          .state,
      ).toBe("ACTIVE");

      for (const [label, action, submit, field, draft] of [
        [
          "editWorkout",
          "updateWorkoutAction",
          "updateWorkout",
          "title",
          "Retained workout draft",
        ],
        [
          "saveAsTemplate",
          "saveWorkoutTemplateAction",
          "saveAsTemplate",
          "title",
          "Retained template draft",
        ],
      ] as const) {
        await page.goto(`/workouts/${data.workout.id}`);
        const summary = page
          .locator("details > summary")
          .filter({ hasText: new RegExp(`^${t(label)}$`) });
        await summary.click();
        const details = summary.locator("..");
        await details.locator(`input[name="${field}"]`).fill(draft);
        await failClosed(details, action, t(submit), t("saveFailed"));
        await expect(details.locator(`input[name="${field}"]`)).toHaveValue(
          draft,
        );
      }
      await page.goto("/measurements");
      const goal = page.locator(".measurements-goal details");
      await goal.locator("summary").click();
      await goal.locator('input[name="weight"]').fill("72");
      await failClosed(
        goal,
        "saveGoalAction",
        t("saveTarget"),
        t("saveFailed"),
      );
      await expect(goal.locator('input[name="weight"]')).toHaveValue("72");
      expect(
        await prisma.bodyGoal.count({ where: { userId: data.user.id } }),
      ).toBe(0);
    }
  } finally {
    await data.dispose();
    await prisma.$disconnect();
  }
});

test("changed screens and expanded controls reflow at real 200 percent browser zoom", async ({
  page,
  context,
}, info) => {
  const data = await fixture(page);
  const directory = await mkdtemp(join(tmpdir(), "fitness-remediation-zoom-"));
  let zoomContext: import("@playwright/test").BrowserContext | undefined;
  try {
    const active = await prisma.workout.create({
      data: {
        userId: data.user.id,
        date: new Date(),
        title: "Live workout / 即時訓練",
        state: "ACTIVE",
        resumedAt: new Date(),
        sets: {
          create: {
            exerciseId: data.exercise.id,
            order: 1,
            weight: 0,
            reps: 1,
            targetWeight: 20,
            targetReps: 8,
            completed: false,
            actualsEntered: false,
          },
        },
      },
    });
    await prisma.bodyMeasurement.createMany({
      data: [0, 1, 2].map((offset) => ({
        userId: data.user.id,
        date: new Date(2026, 9, 20 + offset),
        weight: 71.9 + offset / 10,
        waist: 85,
      })),
    });
    await prisma.bodyGoal.create({
      data: { userId: data.user.id, weight: 72 },
    });
    await prisma.passkey.create({
      data: {
        id: randomUUID(),
        userId: data.user.id,
        name: "Synthetic device / 測試裝置",
        publicKey: Buffer.from("unusable-fixture-public-key"),
        counter: 0,
      },
    });
    const csv = await (await context.request.get("/data/export")).text();
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
    const evidence: unknown[] = [];
    for (const language of ["en", "zh-TW"] as const) {
      const t = dictionary(language);
      await zoomContext.addCookies([
        { name: "locale", value: language, url: origin },
      ]);
      for (const state of [
        "workouts",
        "library",
        "exercise",
        "metadata",
        "completed",
        "active",
        "paused",
        "stats",
        "measurements",
        "measurements-empty",
        "measurements-sparse",
        "measurements-long-target",
        "import-preview",
        "import-error",
        "passkeys",
        "administration",
        "source",
        "missing-exercise",
        "unknown",
      ]) {
        if (state === "active" || state === "paused")
          await prisma.workout.update({
            where: { id: active.id },
            data: { state: state === "active" ? "ACTIVE" : "PAUSED" },
          });
        if (state.startsWith("measurements")) {
          await prisma.bodyMeasurement.deleteMany({
            where: { userId: data.user.id },
          });
          if (state !== "measurements-empty")
            await prisma.bodyMeasurement.createMany({
              data: (state === "measurements-sparse" ? [0] : [0, 1, 2]).map(
                (offset) => ({
                  userId: data.user.id,
                  date: new Date(2026, 9, 20 + offset),
                  weight: 71.9 + offset / 10,
                  waist: 85,
                }),
              ),
            });
          await prisma.bodyGoal.update({
            where: { userId: data.user.id },
            data: {
              weight:
                state === "measurements-long-target" ? 123.12345678901235 : 72,
            },
          });
        }
        const routes: Record<string, string> = {
          workouts: "/workouts",
          library: "/exercises",
          exercise: `/exercises/${data.exercise.id}`,
          metadata: `/exercises/${data.exercise.id}#edit-exercise-metadata`,
          completed: `/workouts/${data.workout.id}`,
          active: `/workouts/${active.id}`,
          paused: `/workouts/${active.id}`,
          stats: "/stats",
          measurements: "/measurements",
          "measurements-empty": "/measurements",
          "measurements-sparse": "/measurements",
          "measurements-long-target": "/measurements",
          "import-preview": "/data",
          "import-error": "/data",
          passkeys: "/account/passkeys",
          administration: "/admin/users",
          source: "/source",
          "missing-exercise": "/exercises/remediation-missing",
          unknown: "/remediation-missing",
        };
        await zoom.goto(routes[state]);
        await expect(zoom.locator("main h1")).toBeVisible();
        await expect(zoom.locator("main .rt-Spinner")).toHaveCount(0);
        await zoom.evaluate(() => document.fonts.ready);
        expect(await zoom.evaluate(() => devicePixelRatio)).toBe(2);
        expect(await zoom.evaluate(() => innerWidth)).toBeLessThan(800);
        if (state === "measurements-empty") {
          await expect(zoom.locator("main")).toContainText(t("noMeasurements"));
          await zoom.locator(".measurements-goal summary").click();
          const save = zoom.locator(".measurements-goal button[type=submit]");
          await save.focus();
          await expect(save).toBeFocused();
        } else if (state.startsWith("measurements")) {
          await zoom.locator(".measurement-edit > summary").first().click();
          await zoom.locator(".measurements-goal summary").click();
          const save = zoom
            .locator(".measurement-edit button[type=submit]")
            .first();
          await save.focus();
          await expect(save).toBeFocused();
          const target = await zoom.locator(".chart-target").boundingBox();
          const plot = await zoom
            .locator(".training-chart svg")
            .first()
            .boundingBox();
          if (!target || !plot)
            throw new Error("Missing target legend or plot");
          expect(target.y + target.height).toBeLessThanOrEqual(plot.y);
          if (state !== "measurements")
            await zoom.locator(".chart-target").scrollIntoViewIfNeeded();
        }
        if (state === "completed")
          await zoom
            .locator("summary")
            .filter({ hasText: new RegExp(`^${t("editWorkout")}$`) })
            .click();
        if (state === "administration")
          await zoom.locator(".admin-create > summary").click();
        if (state.startsWith("import-")) {
          await zoom.getByLabel(t("file"), { exact: true }).setInputFiles({
            name: "fixture.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(
              state === "import-preview" ? csv : "invalid CSV",
            ),
          });
          await zoom
            .getByRole("button", { name: t("preview"), exact: true })
            .click();
          if (state === "import-preview")
            await expect(
              zoom.getByRole("button", {
                name: t("confirmImport"),
                exact: true,
              }),
            ).toBeVisible();
          else
            await expect(zoom.getByRole("status")).toContainText(t("csvError"));
        }
        expect(
          await zoom.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${state}-${language}-zoom200`,
        ).toBe(true);
        const violations = (
          await new AxeBuilder({ page: zoom })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations;
        expect(violations, `${state}-${language}-zoom200 axe`).toEqual([]);
        const session = await zoomContext.newCDPSession(zoom);
        try {
          const { data: screenshot } = await session.send(
            "Page.captureScreenshot",
            { format: "png", captureBeyondViewport: false, fromSurface: true },
          );
          const png = Buffer.from(screenshot, "base64");
          expect(png.readUInt32BE(16)).toBe(
            await zoom.evaluate(() =>
              Math.round(innerWidth * devicePixelRatio),
            ),
          );
          await writeFile(
            info.outputPath(`${state}-${language}-zoom200.png`),
            png,
          );
        } finally {
          await session.detach();
        }
        evidence.push({
          state,
          language,
          ...(await zoom.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
            pageWidth: document.documentElement.scrollWidth,
            devicePixelRatio,
          }))),
        });
      }
    }
    await writeFile(
      info.outputPath("zoom-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
  } finally {
    await zoomContext?.close();
    await rm(directory, { recursive: true, force: true });
    await data.dispose();
    await prisma.$disconnect();
  }
});
