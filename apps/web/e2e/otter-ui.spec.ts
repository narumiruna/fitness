import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  test as base,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import type { Locale } from "../src/lib/locales";
import { dictionary } from "../src/lib/translations";

type OtterData = { username: string; workoutId: string; exerciseId: string };
const password = "otter-fixture-password";
const exerciseName = "Otter press / 水獺臥推";
const workoutTitle = "Otter workout / 水獺訓練";
const passkeyName = "Otter device / 水獺裝置";
const clientName = "Otter client / 水獺用戶端";

// One private fixture supplies every populated screen. No shared seed account,
// passkey registration, import, or other workflow mutation is needed.
const test = base.extend<{ otterData: OtterData }>({
  otterData: async ({ page: _page }, use) => {
    const key = randomUUID();
    const clientId = `https://otter-fixture.invalid/${key}`;
    const user = await prisma.user.create({
      data: {
        username: `otter-${key}`,
        passwordHash: await bcrypt.hash(password, 4),
        role: "ADMIN",
        exercises: { create: { slug: key, defaultName: exerciseName } },
      },
      include: { exercises: true },
    });
    const exerciseId = user.exercises[0].id;
    try {
      const today = new Date();
      let workoutId = "";
      for (const days of [0, 2, 4, 6, 8]) {
        const date = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - days,
        );
        const workout = await prisma.workout.create({
          data: {
            userId: user.id,
            date,
            title: days === 0 ? workoutTitle : `${workoutTitle} ${days}`,
            notes: "Synthetic layout notes / 版面測試備註。 ".repeat(6),
            sets: {
              create: [1, 2, 3].map((order) => ({
                exerciseId,
                order,
                weight: 40 + days,
                reps: 8,
              })),
            },
          },
        });
        if (days === 0) workoutId = workout.id;
        await prisma.bodyMeasurement.create({
          data: { userId: user.id, date, weight: 72 + days / 10, waist: 82 },
        });
      }
      await prisma.bodyGoal.create({
        data: { userId: user.id, weight: 70 },
      });
      await prisma.passkey.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          name: passkeyName,
          publicKey: Buffer.from("unusable-otter-layout-fixture"),
          counter: 0,
        },
      });
      await prisma.mcpClient.create({
        data: {
          id: clientId,
          name: clientName,
          redirectUris: "[]",
          preRegistered: true,
          grants: {
            create: {
              userId: user.id,
              resource: "http://localhost:8785/mcp",
              scopes: "fitness:read",
              expiresAt: new Date(today.getTime() + 86_400_000),
            },
          },
        },
      });
      await use({ username: user.username, exerciseId, workoutId });
    } finally {
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } finally {
        await Promise.all([
          prisma.exercise.delete({ where: { id: exerciseId } }),
          prisma.mcpClient.deleteMany({ where: { id: clientId } }),
        ]);
      }
    }
  },
});

test.use({ locale: "en" });
test.afterAll(async () => prisma.$disconnect());

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Missing layout element");
  return value;
}

async function setLocale(page: Page, locale: Locale) {
  await page
    .context()
    .addCookies([
      { name: "locale", value: locale, url: new URL(page.url()).origin },
    ]);
}

async function inspect(page: Page, info: TestInfo, name: string) {
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  await expect(page.locator("main .rt-Spinner")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".radix-themes").first()).toHaveAttribute(
    "data-accent-color",
    "green",
  );
  await expect(page.locator(".radix-themes").first()).toHaveAttribute(
    "data-gray-color",
    "sage",
  );
  expect(
    await page
      .getByRole("main")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toMatch(/Geist/);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        (font) => font.family.includes("Geist") && font.status === "loaded",
      ),
    ),
    `${name}: Geist font loaded`,
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    `${name}: no horizontal document overflow`,
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
    `${name}: axe`,
  ).toEqual([]);
  // Playwright outputPath is under ignored test-results, not a source snapshot.
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
  await page.screenshot({
    path: info.outputPath(`${name}-viewport.png`),
    animations: "disabled",
  });
}

async function expectShell(page: Page, locale: Locale, width: number) {
  const t = dictionary(locale);
  const header = page.getByRole("banner");
  const nav = header.getByRole("navigation", {
    name: t("primaryNavigation"),
    exact: true,
  });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(
    header.getByRole("link", { name: t("appName"), exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    header.getByRole("combobox", { name: t("language") }),
  ).toBeInViewport({ ratio: 1 });
  const navBox = await box(nav);
  if (width <= 720) {
    expect((await box(header)).height).toBeCloseTo(64, 0);
    await expect(nav).toHaveCSS("position", "fixed");
    expect(navBox.x).toBeCloseTo(0, 0);
    expect(navBox.width).toBeCloseTo(width, 0);
    expect(navBox.y + navBox.height).toBeCloseTo(
      await page.evaluate(() => innerHeight),
      0,
    );
    await expect(nav.getByRole("link")).toHaveCount(4);
    for (const key of ["workouts", "calendar", "stats", "exercises"] as const)
      await expect(
        nav.getByRole("link", { name: t(key), exact: true }),
      ).toBeInViewport({ ratio: 1 });
    const more = nav.getByRole("button", {
      name: t("moreNavigation"),
      exact: true,
    });
    await expect(more).toHaveClass(/mobile-menu-trigger/);
    await expect(more).toContainText(t("moreNavigation"));
    await expect(more).toBeInViewport({ ratio: 1 });
    await expect(
      header.getByRole("link", { name: t("account"), exact: true }),
    ).toHaveCount(0);
  } else {
    await expect(nav.getByRole("link")).toHaveCount(6);
    await expect(nav.locator(".mobile-menu-trigger")).toBeHidden();
    for (const key of ["admin", "account"] as const)
      await expect(
        header.getByRole("link", { name: t(key), exact: true }),
      ).toBeInViewport({ ratio: 1 });
    await expect(
      header.getByRole("button", { name: t("signOut"), exact: true }),
    ).toBeInViewport({ ratio: 1 });
    if (width > 900) {
      await expect(nav).toHaveCSS("position", "fixed");
      expect(navBox.x).toBeCloseTo(0, 0);
      expect(navBox.width).toBeCloseTo(width > 1100 ? 248 : 208, 0);
      expect((await box(page.getByRole("main"))).x).toBeGreaterThanOrEqual(
        navBox.width,
      );
    } else {
      await expect(nav).not.toHaveCSS("position", "fixed");
      for (const control of [
        header.getByRole("link", { name: t("appName"), exact: true }),
        header.getByRole("combobox", { name: t("language") }),
      ]) {
        const controlBox = await box(control);
        expect(navBox.y).toBeGreaterThanOrEqual(
          controlBox.y + controlBox.height,
        );
      }
      const links = await nav.getByRole("link").all();
      const first = await box(links[0]);
      for (const link of links)
        expect((await box(link)).y).toBeCloseTo(first.y, 0);
    }
  }
}

async function expectBottomClearance(page: Page) {
  const nav = page.locator(".primary-nav");
  const main = page.getByRole("main");
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const lastContent = await box(main.locator(":scope > :last-child"));
  expect(lastContent.y + lastContent.height).toBeLessThanOrEqual(
    (await box(nav)).y,
  );
  // Reset focus before the artificial scroll; focus() on an already focused
  // control does not ask the browser to reveal it a second time.
  await main.focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  const lastControl = main
    .locator(
      'a:visible, button:visible, input:not([type="hidden"]):visible, textarea:visible, summary:visible, [role="combobox"]:visible',
    )
    .last();
  await lastControl.focus();
  await expect(lastControl).toBeFocused();
  await expect
    .poll(
      async () => {
        const control = await box(lastControl);
        return (
          control.y >= 0 && control.y + control.height <= (await box(nav)).y
        );
      },
      { message: "Focused content must remain above the fixed bottom bar" },
    )
    .toBe(true);
}

async function expectMeasuredNavigation(page: Page) {
  const nav = page.locator(".primary-nav");
  const originalStyle = await nav.getAttribute("style");
  const originalHeight = (await box(nav)).height;
  try {
    // A real size change must update the reserved space, not just a fixed token.
    await nav.evaluate((el, height) => {
      el.style.minHeight = `${height + 32}px`;
    }, originalHeight);
    await expect
      .poll(async () => {
        const measured = await page.evaluate(() =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--fitness-navigation-height",
            ),
          ),
        );
        return Math.abs(measured - (await box(nav)).height);
      })
      .toBeLessThan(1);
    expect((await box(nav)).height).toBeGreaterThan(originalHeight);
    await expectBottomClearance(page);
  } finally {
    await nav.evaluate((el, style) => {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }, originalStyle);
  }
}

async function expectNestedNavigation(
  page: Page,
  data: OtterData,
  locale: Locale,
  mobile: boolean,
) {
  const t = dictionary(locale);
  const nav = page.locator(".primary-nav");
  for (const [path, parent] of [
    [`/workouts/${data.workoutId}`, "/workouts"],
    [`/exercises/${data.exerciseId}`, "/exercises"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      parent,
    );
  }
  if (!mobile) return;
  await page.goto("/account/connections");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    t("mcpConnections"),
  );
  // Radix hides the background accessibility tree while the dialog is open.
  const trigger = nav.locator(".mobile-menu-trigger");
  await expect(trigger).toHaveAccessibleName(t("moreNavigation"));
  await expect(trigger).toHaveAttribute("data-active", "true");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: t("moreNavigation"),
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("link", { name: t("account"), exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: t("account"), exact: true }).click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("main")).toBeFocused();
  const passkeys = page
    .getByRole("main")
    .getByRole("link", { name: t("passkeys"), exact: true });
  await passkeys.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/account\/passkeys$/);
  await expect(page.getByRole("main")).toBeFocused();
  await expect(trigger).toHaveAttribute("data-active", "true");
}

test("Otter design reflows with accessible fixed navigation in both languages", async ({
  page,
  otterData,
}, info) => {
  test.setTimeout(600_000);
  await page.goto("/login");
  for (const locale of ["en", "zh-TW"] as const) {
    await setLocale(page, locale);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        dictionary(locale)("signIn"),
      );
      await inspect(page, info, `login-${locale}-${width}`);
      await page
        .getByRole("combobox", { name: dictionary(locale)("language") })
        .click();
      const languages = page.getByRole("listbox");
      await expect(languages).toBeVisible();
      const popup = await box(languages);
      expect(
        popup.height,
        "Two language options need a compact popup",
      ).toBeLessThan(200);
      expect(popup.y).toBeGreaterThanOrEqual(0);
      expect(popup.y + popup.height).toBeLessThanOrEqual(900);
      await page.keyboard.press("Escape");
      await expect(languages).toHaveCount(0);
    }
  }
  await setLocale(page, "en");
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(otterData.username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  for (const locale of ["en", "zh-TW"] as const) {
    const t = dictionary(locale);
    await setLocale(page, locale);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, heading] of [
        ["/workouts", t("workouts")],
        ["/calendar", t("calendar")],
        ["/stats", t("stats")],
        ["/exercises", t("exercises")],
        ["/measurements", t("measurements")],
        ["/data", t("dataTransfer")],
        ["/account/password", t("changePassword")],
        ["/account/passkeys", t("passkeys")],
        ["/account/connections", t("mcpConnections")],
        ["/admin/users", t("users")],
      ]) {
        await page.goto(path === "/exercises" ? "/exercises?q=Otter" : path);
        await expect(
          page.getByRole("main").getByRole("heading", { level: 1 }),
        ).toHaveText(heading);
        if (path === "/workouts")
          await expect(page.locator(".workout-card")).toHaveCount(5);
        if (path === "/calendar")
          await expect(page.locator(".selected-workout")).toContainText(
            workoutTitle,
          );
        if (path === "/stats")
          await expect(page.locator(".training-chart").first()).toBeVisible();
        if (path === "/exercises")
          await expect(
            page.locator(".exercise-row").filter({ hasText: exerciseName }),
          ).toBeVisible();
        if (path === "/measurements")
          await expect(page.locator(".measurement-edit")).toHaveCount(5);
        if (path === "/account/passkeys")
          await expect(page.getByRole("main")).toContainText(passkeyName);
        if (path === "/account/connections")
          await expect(page.getByRole("main")).toContainText(clientName);
        if (path === "/admin/users")
          await expect(page.getByRole("table")).toContainText(
            otterData.username,
          );
        await expectShell(page, locale, width);
        const name = `${path.slice(1).replaceAll("/", "-")}-${locale}-${width}`;
        await inspect(page, info, name);
        if (width <= 720 && path === "/measurements") {
          expect(
            await page.evaluate(() => document.documentElement.scrollHeight),
          ).toBeGreaterThan(900);
          await expectBottomClearance(page);
          await expectMeasuredNavigation(page);
        }
      }
      await expectNestedNavigation(page, otterData, locale, width <= 720);
    }
    // Cover the narrower desktop sidebar without repeating the route audit.
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto("/workouts");
    await expectShell(page, locale, 1000);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".primary-nav")).toBeHidden();
  await expect(page.getByRole("main")).toHaveCSS("margin-left", "0px");
  await page.emulateMedia({ media: "screen" });
});
