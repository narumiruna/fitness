import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import {
  chromium,
  expect,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import bcrypt from "bcryptjs";
import { createParticipantFixture } from "../../../tests/fixtures/ui-ux-participant";
import { normalizeExerciseAlias } from "../../api/src/lib/exercises";
import { prisma } from "../../api/src/lib/prisma";

async function ready(page: Page) {
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.locator(".bootstrap-status")).toHaveCount(0);
  await expect(
    page.locator("main h1, main [role=alert]").first(),
  ).toBeVisible();
  await expect(page.locator("main .rt-Spinner")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

// Record observations, including defects, without changing application behavior.
// Passing this audit means evidence was collected, not that usability passed.
async function inspect(page: Page, info: TestInfo, name: string) {
  await ready(page);
  if (name.endsWith("zoom200")) {
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    expect(await page.evaluate(() => innerWidth)).toBeLessThan(800);
  }
  const inventory = await page.evaluate(() => {
    const visible = (element: Element) =>
      element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      });
    const describe = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        role: element.getAttribute("role"),
        text: element.getAttribute("aria-label") || element.textContent?.trim(),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        inFirstViewport: box.top >= 0 && box.bottom <= innerHeight,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    };
    return {
      path: location.pathname + location.search,
      language: document.documentElement.lang,
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      headings: [...document.querySelectorAll("h1,h2,h3")]
        .filter(visible)
        .map(describe),
      controls: [
        ...document.querySelectorAll(
          "main button, main a, main summary, main input:not([type=hidden]), main select, main [role=combobox]",
        ),
      ]
        .filter(visible)
        .map(describe),
      paragraphs: [...document.querySelectorAll("main p")]
        .filter(visible)
        .map(describe),
      navigation: [...document.querySelectorAll("nav a")]
        .filter(visible)
        .map(describe),
      localScroll: [...document.querySelectorAll("main *")]
        .filter(
          (element) =>
            visible(element) &&
            element.clientWidth > 0 &&
            element.scrollWidth > element.clientWidth + 1 &&
            ["auto", "scroll"].includes(getComputedStyle(element).overflowX),
        )
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
    };
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const screenshotPath = info.outputPath(`${name}.png`);
  if (name.endsWith("zoom200")) {
    // Playwright's CSS-sized clip crops native browser-zoom captures. Capture
    // the full physical viewport directly, then verify its expected pixel width.
    const session = await page.context().newCDPSession(page);
    try {
      const { data } = await session.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
        fromSurface: true,
      });
      const png = Buffer.from(data, "base64");
      expect(png.readUInt32BE(16)).toBe(
        await page.evaluate(() => Math.round(innerWidth * devicePixelRatio)),
      );
      await writeFile(screenshotPath, png);
    } finally {
      await session.detach();
    }
  } else {
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
  }
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  return {
    name,
    keyboardSkipToMain: true,
    ...inventory,
    accessibility: accessibility.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  };
}

async function save(info: TestInfo, evidence: unknown) {
  const path = info.outputPath("review-evidence.json");
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach("review-evidence", {
    path,
    contentType: "application/json",
  });
}

async function login(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/workouts$/);
}

async function locale(page: Page, value: "en" | "zh-TW") {
  await page
    .context()
    .addCookies([{ name: "locale", value, url: new URL(page.url()).origin }]);
}

async function atDoubleZoom(page: Page, review: (page: Page) => Promise<void>) {
  const profile = await mkdtemp(join(tmpdir(), "fitness-review-zoom-"));
  try {
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
      viewport: null,
      baseURL: new URL(page.url()).origin,
      ignoreHTTPSErrors: true,
      args: ["--window-size=1440,900"],
    });
    try {
      const zoomPage = await context.newPage();
      // Change real browser zoom in an isolated profile, not CSS zoom, DPR
      // emulation, or pinch scaling. Never use the user's browser profile.
      await zoomPage.goto("chrome://settings/appearance");
      await zoomPage.locator("#zoomLevel").selectOption("2", { force: true });
      await expect(zoomPage.locator("#zoomLevel")).toHaveValue("2");
      await context.addCookies(await page.context().cookies());
      await review(zoomPage);
    } finally {
      await context.close();
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

test("UI UX review: first-run setup and guest screens", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const username = `review-setup-${randomUUID()}`;
  const evidence = [];
  try {
    expect(await prisma.user.count()).toBe(0);
    for (const language of ["en", "zh-TW"] as const) {
      await page.goto("/");
      await locale(page, language);
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        await page.goto("/");
        await expect(page).toHaveURL(/\/setup$/);
        await expect(page.locator("h1")).toBeVisible();
        evidence.push(await inspect(page, info, `setup-${language}-${width}`));
      }
    }
    await atDoubleZoom(page, async (zoomPage) => {
      for (const language of ["en", "zh-TW"] as const) {
        await zoomPage.goto("/");
        await locale(zoomPage, language);
        await zoomPage.goto("/");
        await expect(zoomPage).toHaveURL(/\/setup$/);
        await expect(zoomPage.locator("h1")).toBeVisible();
        evidence.push(
          await inspect(zoomPage, info, `setup-${language}-zoom200`),
        );
      }
    });
    await locale(page, "en");
    await page.goto("/setup");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill("review-only-password");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/workouts$/);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { username } })).role,
    ).toBe("ADMIN");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    for (const language of ["en", "zh-TW"] as const) {
      await locale(page, language);
      for (const width of [1440, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        for (const route of ["/login", "/source", "/review-missing"]) {
          await page.goto(route);
          if (route === "/review-missing")
            await expect(page.locator('main [role="alert"]')).toBeVisible();
          else await expect(page.locator("h1")).toBeVisible();
          evidence.push(
            await inspect(
              page,
              info,
              `guest-${route.slice(1)}-${language}-${width}`,
            ),
          );
        }
      }
    }
    await atDoubleZoom(page, async (zoomPage) => {
      for (const language of ["en", "zh-TW"] as const) {
        await zoomPage.goto("/login");
        await locale(zoomPage, language);
        for (const route of ["/login", "/source", "/review-missing"]) {
          await zoomPage.goto(route);
          if (route === "/review-missing")
            await expect(zoomPage.locator('main [role="alert"]')).toBeVisible();
          else await expect(zoomPage.locator("h1")).toBeVisible();
          evidence.push(
            await inspect(
              zoomPage,
              info,
              `guest-${route.slice(1)}-${language}-zoom200`,
            ),
          );
        }
      }
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    try {
      await save(info, evidence);
    } finally {
      await prisma.user.deleteMany({ where: { username } });
    }
  }
});

test("UI UX review: every signed-in page and data state", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const key = randomUUID();
  const password = "review-only-password";
  const userIds: string[] = [];
  const exerciseIds: string[] = [];
  const evidence = [];
  try {
    const passwordHash = await bcrypt.hash(password, 4);
    for (const role of ["USER", "USER", "ADMIN"]) {
      const user = await prisma.user.create({
        data: {
          username: `review-${userIds.length}-${key}`,
          passwordHash,
          role,
        },
      });
      userIds.push(user.id);
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[0] },
    });
    const exercise = await prisma.exercise.create({
      data: {
        slug: key,
        defaultName: "Bench Press / 槓鈴臥推 — long-name review fixture",
        createdByUserId: user.id,
        aliases: {
          create: {
            locale: "en",
            alias: "Review press",
            normalizedAlias: normalizeExerciseAlias("Review press"),
          },
        },
        muscles: { create: { muscle: "chest", role: "PRIMARY" } },
        equipment: { create: { equipment: "barbell" } },
      },
    });
    exerciseIds.push(exercise.id);
    const now = new Date();
    let completedId = "";
    for (let i = 0; i < 24; i++) {
      const workout = await prisma.workout.create({
        data: {
          userId: user.id,
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - i),
          title:
            i === 0
              ? "Upper body / 上肢訓練 — long-title review fixture"
              : `Session ${i}`,
          notes:
            i === 0 ? "Synthetic notes for layout review. ".repeat(8) : null,
          sets: {
            create: [
              { exerciseId: exercise.id, order: 1, weight: 40, reps: 8 },
              {
                exerciseId: exercise.id,
                order: 2,
                weight: 20,
                reps: 8,
                type: "WARMUP",
              },
            ],
          },
        },
      });
      if (i === 0) completedId = workout.id;
    }
    const active = await prisma.workout.create({
      data: {
        userId: user.id,
        date: now,
        title: "Training / 訓練",
        state: "ACTIVE",
        startedAt: now,
        resumedAt: now,
        sets: {
          create: [1, 2, 3].map((order) => ({
            exerciseId: exercise.id,
            order,
            weight: 0,
            reps: 1,
            targetWeight: 40,
            targetReps: 8,
            completed: false,
            actualsEntered: false,
          })),
        },
      },
    });
    await prisma.workoutTemplate.create({
      data: {
        userId: user.id,
        title: "Upper body routine / 上肢課表",
        sets: {
          create: { exerciseId: exercise.id, order: 1, weight: 40, reps: 8 },
        },
      },
    });
    await prisma.bodyMeasurement.createMany({
      data: [0, 7, 14].map((days) => ({
        userId: user.id,
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - days),
        weight: 75 + days / 10,
        waist: 82 + days / 10,
      })),
    });
    await prisma.bodyGoal.create({ data: { userId: user.id, weight: 72 } });
    await login(page, user.username, password);
    const routes = [
      ["workouts", "/workouts"],
      ["new", `/workouts/new?date=${formatDateKey(now)}`],
      ["completed", `/workouts/${completedId}`],
      ["active", `/workouts/${active.id}`],
      ["calendar", "/calendar"],
      ["stats", "/stats"],
      ["exercises", "/exercises"],
      ["exercise", `/exercises/${exercise.id}`],
      ["measurements", "/measurements"],
      ["data", "/data"],
      ["password", "/account/password"],
      ["passkeys", "/account/passkeys"],
      ["source", "/source"],
      ["missing", "/review-missing"],
    ];
    for (const language of ["en", "zh-TW"] as const) {
      await locale(page, language);
      for (const [name, route] of routes) {
        await page.goto(route);
        if (name !== "missing") await expect(page.locator("h1")).toBeAttached();
        else await expect(page.locator('main [role="alert"]')).toBeVisible();
        for (const width of [1440, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 900,
          });
          await page.evaluate(() => window.scrollTo(0, 0));
          evidence.push(
            await inspect(page, info, `${name}-${language}-${width}`),
          );
        }
        await page.setViewportSize({ width: 320, height: 844 });
        evidence.push({
          name: `${name}-${language}-320-reflow`,
          pageWidth: await page.evaluate(
            () => document.documentElement.scrollWidth,
          ),
          viewportWidth: 320,
        });
      }
    }
    await atDoubleZoom(page, async (zoomPage) => {
      for (const language of ["en", "zh-TW"] as const) {
        await zoomPage.goto("/workouts");
        await locale(zoomPage, language);
        for (const [name, route] of routes) {
          await zoomPage.goto(route);
          if (name === "missing")
            await expect(zoomPage.locator('main [role="alert"]')).toBeVisible();
          else await expect(zoomPage.locator("h1")).toBeAttached();
          evidence.push(
            await inspect(zoomPage, info, `${name}-${language}-zoom200`),
          );
        }
      }
    });
    await locale(page, "en");
    await page.goto("/");
    await expect(page).toHaveURL(/\/workouts$/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/workouts$/);
    await page.goto("/workouts?page=2");
    await expect(page.locator(".workout-card")).toHaveCount(5);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workouts?q=absent-review-query");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".workout-card")).toHaveCount(0);
    evidence.push(await inspect(page, info, "no-results-en-390"));
    const combinedFilters =
      "/exercises?q=Bench&sort=recent&muscle=chest&equipment=barbell";
    for (const expanded of [false, true]) {
      await page.goto(combinedFilters);
      const queryForm = page.locator(".library-query");
      if (expanded) await queryForm.locator("summary").click();
      await queryForm.getByRole("textbox", { name: "Search" }).fill("Review");
      await queryForm
        .getByRole("button", { name: "Search", exact: true })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("q") === "Review" &&
          url.searchParams.get("sort") === "recent" &&
          url.searchParams.get("muscle") === "chest" &&
          url.searchParams.get("equipment") === "barbell",
      );
      await expect(
        page.getByRole("heading", { name: exercise.defaultName, exact: true }),
      ).toBeVisible();
      evidence.push({
        name: `search-submit-preserves-filters-${expanded ? "expanded" : "collapsed"}`,
        query: new URL(page.url()).search,
      });
    }
    await page.goto(`/exercises/${exercise.id}`);
    await ready(page);
    await page.screenshot({
      path: info.outputPath("exercise-en-390-full.png"),
      fullPage: true,
    });
    await page.goto(`/workouts/${completedId}`);
    await ready(page);
    await page.screenshot({
      path: info.outputPath("completed-en-390-full.png"),
      fullPage: true,
    });
    await page.goto(`/workouts/${active.id}`);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume", exact: true }),
    ).toBeVisible();
    evidence.push(await inspect(page, info, "paused-en-390"));
    for (const index of [1, 2]) {
      const account = await prisma.user.findUniqueOrThrow({
        where: { id: userIds[index] },
      });
      await login(page, account.username, password);
      for (const language of ["en", "zh-TW"] as const) {
        await locale(page, language);
        const paths =
          index === 2
            ? [["admin", "/admin/users"]]
            : [
                ["empty-workouts", "/workouts"],
                ["empty-calendar", "/calendar"],
                ["empty-stats", "/stats"],
                ["empty-measurements", "/measurements"],
                ["non-owner-exercise", `/exercises/${exercise.id}`],
                ["foreign-workout", `/workouts/${completedId}`],
                ["missing-record", "/workouts/review-absent-id"],
              ];
        for (const [name, route] of paths) {
          await page.goto(route);
          if (name === "foreign-workout" || name === "missing-record") {
            await expect(page.locator('main [role="alert"]')).toBeVisible();
          } else await expect(page.locator("h1")).toBeAttached();
          for (const width of [1440, 390]) {
            await page.setViewportSize({
              width,
              height: width === 390 ? 844 : 900,
            });
            await page.evaluate(() => window.scrollTo(0, 0));
            evidence.push(
              await inspect(page, info, `${name}-${language}-${width}`),
            );
          }
        }
      }
    }
  } finally {
    try {
      await save(info, evidence);
    } finally {
      try {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      } finally {
        await prisma.exercise.deleteMany({
          where: { id: { in: exerciseIds } },
        });
      }
    }
  }
});

test("participant fixture starts empty and cleans its accounts and exercise", async ({
  page,
}) => {
  const fixture = await createParticipantFixture();
  try {
    await login(page, fixture.username, fixture.password);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await prisma.workout.count({ where: { userId: fixture.userId } }),
    ).toBe(0);
    expect(
      await prisma.workoutTemplate.count({ where: { userId: fixture.userId } }),
    ).toBe(1);
    await page.goto("/exercises");
    await expect(
      page.getByRole("heading", { name: "Bench Press", exact: true }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
  expect(await prisma.user.count({ where: { id: fixture.userId } })).toBe(0);
  expect(
    await prisma.exercise.count({ where: { id: fixture.exerciseId } }),
  ).toBe(0);
});

test("bootstrap loading, failure, and retry have visible feedback", async ({
  page,
}, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    await page.route("**/api/bootstrap", async (route) => {
      if (first) {
        first = false;
        await gate;
        await route.fulfill({ status: 503, json: {} });
      } else {
        await route.fulfill({
          json: { hasUsers: true, user: null, locale: "en" },
        });
      }
    });
    try {
      await page.goto("/");
      await expect(
        page.getByRole("progressbar", { name: "Fitness" }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`bootstrap-loading-${width}.png`),
      });
      release();
      await expect(
        page.locator(".bootstrap-status [role=alert]"),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`bootstrap-error-${width}.png`),
      });
      await page.locator(".bootstrap-status button").click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator("h1")).toHaveText("Sign in");
      await expect(page.locator(".bootstrap-status")).toHaveCount(0);
    } finally {
      release();
      await page.unroute("**/api/bootstrap");
    }
  }
});
