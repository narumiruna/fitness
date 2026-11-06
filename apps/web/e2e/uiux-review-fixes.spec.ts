import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { englishMessages } from "../src/lib/messages";
import { traditionalChineseMessages } from "../src/lib/messages-zh-tw";

let userId: string;
let exerciseId: string;
let liveId: string;
let recordedId: string;

async function refreshAfterTabReturn(page: Page, workoutId: string) {
  const response = page.waitForResponse((response) =>
    response.url().endsWith(`/api/views/workouts/${workoutId}`),
  );
  // Headless tabs remain visible. Emit the browser's hidden-to-visible transition.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    window.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await response;
}

test.beforeEach(async ({ page }) => {
  const username = `review-fixes-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("review-password", 4) },
  });
  userId = user.id;
  const exercise = await prisma.exercise.create({
    data: {
      slug: randomUUID(),
      defaultName: "Review press",
      createdByUserId: userId,
    },
  });
  exerciseId = exercise.id;
  const recorded = await prisma.workout.create({
    data: {
      userId,
      date: new Date(),
      title: "Recorded review",
      sets: { create: { exerciseId, order: 1, weight: 40, reps: 8 } },
    },
  });
  recordedId = recorded.id;
  const live = await prisma.workout.create({
    data: {
      userId,
      date: new Date(),
      title: "Live review",
      state: "ACTIVE",
      resumedAt: new Date(),
      sets: {
        create: [1, 2].map((order) => ({
          exerciseId,
          order,
          weight: 40,
          reps: 8,
          targetWeight: 40,
          targetReps: 8,
          actualsEntered: true,
          completed: false,
        })),
      },
    },
  });
  liveId = live.id;
  await page.goto("/login");
  await page.locator('[name="username"]').fill(username);
  await page.locator('[name="password"]').fill("review-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
});

test.afterEach(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.exercise.delete({ where: { id: exerciseId } });
});
test.afterAll(async () => prisma.$disconnect());

for (const locale of ["en", "zh-TW"] as const) {
  const t = locale === "en" ? englishMessages : traditionalChineseMessages;
  for (const command of ["save", "complete"] as const) {
    test(`same-set refresh requires review before ${command} (${locale})`, async ({
      page,
      context,
    }, info) => {
      await context.addCookies([
        { name: "locale", value: locale, url: "http://localhost:8784" },
      ]);
      await page.goto(`/workouts/${liveId}`);
      const draft = page.locator(".session-set form").filter({
        has: page.locator('input[name="order"][value="1"]'),
      });
      await draft.locator('[name="weight"]').fill("31");
      await draft.locator('[name="reps"]').fill("7");
      await draft.locator("details > summary").click();
      await draft.locator('[name="rir"]').fill("1.5");
      await draft.locator('[name="notes"]').fill("Local draft");
      const other = await context.newPage();
      await other.goto(`/workouts/${liveId}`);
      const remote = other.locator(".session-set form").first();
      await remote.locator('[name="weight"]').fill("60");
      await remote.locator('[name="reps"]').fill("5");
      await remote.locator("details > summary").click();
      await remote.locator('[name="rir"]').fill("2");
      await remote
        .locator('[name="notes"]')
        .fill(`Saved in another tab ${"x".repeat(160)}`);
      await remote.getByRole("button", { name: t.save, exact: true }).click();
      await expect(remote.getByRole("status")).toHaveText(t.saved);

      await refreshAfterTabReturn(page, liveId);
      const conflict = draft.locator(".session-set-conflict");
      await expect(conflict).toContainText(t.latestSavedValues);
      await expect(conflict).toContainText("60");
      await expect(conflict).toContainText("Saved in another tab");
      await expect(draft.locator('[name="version"]')).toHaveValue("0");
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(conflict).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if (command === "save" && width === 390) {
          await conflict.screenshot({
            path: info.outputPath(`session-conflict-${locale}.png`),
          });
        }
      }
      const submit = draft.getByRole("button", {
        name: t[command],
        exact: true,
      });
      await submit.click();
      await expect(draft.getByRole("status")).toHaveText(t.sessionConflict);
      expect(
        await prisma.workoutSet.findFirstOrThrow({
          where: { workoutId: liveId, order: 1 },
        }),
      ).toMatchObject({ weight: 60, reps: 5, rir: 2, completed: false });
      expect(
        (await prisma.workout.findUniqueOrThrow({ where: { id: liveId } }))
          .version,
      ).toBe(1);
      await draft.getByRole("button", { name: t.refreshSession }).click();
      await expect(conflict).toBeVisible();
      await draft.getByRole("button", { name: t.keepSessionDraft }).click();
      await expect(conflict).toHaveCount(0);
      await expect(draft.locator('[name="version"]')).toHaveValue("1");
      for (const [name, value] of [
        ["weight", "31"],
        ["reps", "7"],
        ["rir", "1.5"],
        ["notes", "Local draft"],
      ]) {
        await expect(draft.locator(`[name="${name}"]`)).toHaveValue(value);
      }
      await submit.click();
      await expect(draft.locator('[role="status"]')).toHaveText(t.saved);
      expect(
        await prisma.workoutSet.findFirstOrThrow({
          where: { workoutId: liveId, order: 1 },
        }),
      ).toMatchObject({
        weight: 31,
        reps: 7,
        rir: 1.5,
        notes: "Local draft",
        completed: command === "complete",
      });
      await other.close();
    });
  }

  test(`recorded-set save returns keyboard focus to its summary (${locale})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/workouts/${recordedId}`);
    const editor = page.locator(".recorded-set-editor").first();
    const summary = editor.locator(":scope > summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await editor.locator('[name="weight"]').fill("50.25");
    await editor
      .getByRole("button", { name: t.updateSet, exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(summary).toBeFocused();
    await expect(editor).not.toHaveAttribute("open");
    await expect(page.locator(".recorded-set-readout")).toContainText("50.25");
    await page.keyboard.press("Enter");
    await expect(editor.locator('[name="weight"]')).toHaveValue("50.25");
  });

  test(`template save confirms success and blocks an unchanged repeat (${locale})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    await page.goto(`/workouts/${recordedId}`);
    const summary = page
      .locator("summary")
      .filter({ hasText: t.saveAsTemplate });
    await summary.click();
    const form = summary.locator("..").locator("form");
    const title = form.locator('[name="title"]');
    await title.fill("Saved review template");
    const save = form.getByRole("button", {
      name: t.saveAsTemplate,
      exact: true,
    });
    await page.route(
      "**/api/actions/saveWorkoutTemplateAction",
      (route) => route.abort(),
      { times: 1 },
    );
    await save.click();
    await expect(form.getByRole("status")).toHaveText(t.saveFailed);
    await expect(title).toHaveValue("Saved review template");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(form.getByRole("status")).toHaveText(t.saved);
    await expect(save).toBeDisabled();
    await title.press("Enter");
    expect(await prisma.workoutTemplate.count({ where: { userId } })).toBe(1);
    await title.fill("Second review template");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    expect(await prisma.workoutTemplate.count({ where: { userId } })).toBe(2);

    const editor = page.locator(".recorded-set-editor").first();
    await editor.locator(":scope > summary").click();
    await editor.locator('[name="weight"]').fill("45");
    await editor
      .getByRole("button", { name: t.updateSet, exact: true })
      .click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    expect(await prisma.workoutTemplate.count({ where: { userId } })).toBe(3);
    const latest = await prisma.workoutTemplate.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { sets: true },
    });
    expect(latest.sets[0].weight).toBe(45);
  });
}
