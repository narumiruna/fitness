import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import type { Locale } from "../src/lib/locales";
import { dictionary } from "../src/lib/translations";

type Role = "USER" | "ADMIN";
type NavigationData = {
  userId: string;
  exerciseId: string;
  workoutId: string;
};

const test = base.extend<{
  navigationRole: Role;
  navigationData: NavigationData;
}>({
  navigationRole: ["USER", { option: true }],
  navigationData: async ({ page, navigationRole }, use) => {
    const key = randomUUID();
    const user = await prisma.user.create({
      data: {
        username: `navigation-${key}`,
        passwordHash: await bcrypt.hash("navigation-fixture-password", 4),
        role: navigationRole,
        exercises: {
          create: {
            slug: `navigation-${key}`,
            defaultName: "Navigation press / 導覽臥推",
          },
        },
        workouts: {
          create: {
            date: new Date(2026, 9, 20),
            title: "Navigation workout / 導覽訓練",
          },
        },
      },
      include: { exercises: true, workouts: true },
    });
    const exerciseId = user.exercises[0].id;
    try {
      await page.goto("/login");
      await page.getByLabel("Username", { exact: true }).fill(user.username);
      await page
        .getByLabel("Password", { exact: true })
        .fill("navigation-fixture-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workouts$/);
      await use({
        userId: user.id,
        exerciseId,
        workoutId: user.workouts[0].id,
      });
    } finally {
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } finally {
        await prisma.exercise.delete({ where: { id: exerciseId } });
      }
    }
  },
});

test.use({ locale: "en" });
test.afterAll(async () => prisma.$disconnect());

async function expectReflow(page: Page, compact: boolean) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    "The document must not scroll horizontally",
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  if (compact) {
    const header = await page.getByRole("banner").boundingBox();
    if (!header) throw new Error("Missing navigation header");
    expect(header.height, "Closed mobile header height").toBeLessThanOrEqual(
      120,
    );
  }
}

async function auditAndCapture(
  page: Page,
  info: TestInfo,
  name: string,
  browserZoom: boolean,
) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
    `${name} axe`,
  ).toEqual([]);
  if (!browserZoom) {
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      animations: "disabled",
    });
    return;
  }
  // Preserve physical screenshot dimensions at real Chrome browser zoom.
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
    await writeFile(info.outputPath(`${name}.png`), png);
  } finally {
    await session.detach();
  }
}

async function openMenu(page: Page, t: ReturnType<typeof dictionary>) {
  const trigger = page.getByRole("button", {
    name: t("moreNavigation"),
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: t("moreNavigation"),
    exact: true,
  });
  await expect(dialog).toBeVisible();
  // Radix makes the background aria-hidden while its modal is open.
  await expect(page.locator(".mobile-menu-trigger")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  return dialog;
}

async function closeMenu(page: Page, t: ReturnType<typeof dictionary>) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const trigger = page.getByRole("button", {
    name: t("moreNavigation"),
    exact: true,
  });
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

async function verifyNavigation(
  page: Page,
  data: NavigationData,
  role: Role,
  locale: Locale,
  compact: boolean,
  info: TestInfo,
  browserZoom = false,
) {
  const t = dictionary(locale);
  const header = page.getByRole("banner");
  const primary = header.getByRole("navigation", {
    name: t("primaryNavigation"),
    exact: true,
  });
  const trigger = header.getByRole("button", {
    name: t("moreNavigation"),
    exact: true,
  });
  const main = page.getByRole("main");
  await page
    .context()
    .addCookies([
      { name: "locale", value: locale, url: new URL(page.url()).origin },
    ]);
  await page.goto("/workouts");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    t("workouts"),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(
    header.getByRole("link", { name: t("appName"), exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    header.getByRole("combobox", { name: t("language") }),
  ).toBeInViewport({ ratio: 1 });
  await expect(primary.getByRole("link")).toHaveCount(compact ? 4 : 6);
  await expect(primary.locator('a[aria-current="page"]')).toHaveAttribute(
    "href",
    "/workouts",
  );
  for (const link of await primary.getByRole("link").all())
    await expect(link).toBeInViewport({ ratio: 1 });
  await expectReflow(page, compact);
  await auditAndCapture(page, info, "navigation-closed", browserZoom);

  if (compact) {
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect(
      header.getByRole("link", { name: t("account"), exact: true }),
    ).toHaveCount(0);
    await expect(
      header.getByRole("button", { name: t("signOut"), exact: true }),
    ).toHaveCount(0);
    const dialog = await openMenu(page, t);
    await expect(dialog.getByRole("link")).toHaveCount(
      role === "ADMIN" ? 4 : 3,
    );
    for (const label of ["measurements", "dataTransfer", "account"] as const)
      await expect(
        dialog.getByRole("link", { name: t(label), exact: true }),
      ).toBeInViewport({ ratio: 1 });
    await expect(
      dialog.getByRole("link", { name: t("admin"), exact: true }),
    ).toHaveCount(role === "ADMIN" ? 1 : 0);
    await expect(
      dialog.getByRole("button", { name: t("closeNavigation") }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      dialog.getByRole("button", { name: t("signOut"), exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expectReflow(page, false);
    await auditAndCapture(page, info, "navigation-open", browserZoom);
    await closeMenu(page, t);
  } else {
    await expect(trigger).toBeHidden();
    await expect(
      header.getByRole("link", { name: t("admin"), exact: true }),
    ).toHaveCount(role === "ADMIN" ? 1 : 0);
    await expect(
      header.getByRole("link", { name: t("account"), exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      header.getByRole("button", { name: t("signOut"), exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }

  async function expectUtilityActive(label: string) {
    await expect(primary.locator('a[aria-current="page"]:visible')).toHaveCount(
      0,
    );
    await expect(trigger).toHaveAttribute("data-active", "true");
    const dialog = await openMenu(page, t);
    await expect(dialog.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(
      dialog.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await closeMenu(page, t);
  }

  async function follow(path: string, label: string, utility = false) {
    const scope = compact && utility ? await openMenu(page, t) : header;
    await scope.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    const heading =
      path === "/account/password"
        ? t("changePassword")
        : path === "/admin/users"
          ? t("users")
          : label;
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(main).toBeFocused();
    await expectReflow(page, compact);
    if (compact && utility) await expectUtilityActive(label);
    else if (!utility || path === "/measurements" || path === "/data") {
      await expect(primary.locator('a[aria-current="page"]')).toHaveAttribute(
        "href",
        path,
      );
      if (compact)
        await expect(trigger).not.toHaveAttribute("data-active", "true");
    }
  }

  // Reach every primary destination through the visible navigation, not goto.
  for (const [path, label, utility] of [
    ["/calendar", t("calendar"), false],
    ["/stats", t("stats"), false],
    ["/exercises", t("exercises"), false],
    ["/measurements", t("measurements"), true],
    ["/data", t("dataTransfer"), true],
    ["/workouts", t("workouts"), false],
  ] as const)
    await follow(path, label, utility);

  for (const [path, parent, title] of [
    [
      `/workouts/${data.workoutId}`,
      "/workouts",
      "Navigation workout / 導覽訓練",
    ],
    [
      `/exercises/${data.exerciseId}`,
      "/exercises",
      "Navigation press / 導覽臥推",
    ],
  ]) {
    await page.goto(path);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(primary.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      parent,
    );
    if (compact)
      await expect(trigger).not.toHaveAttribute("data-active", "true");
    await expectReflow(page, compact);
  }

  await follow("/account/password", t("account"), true);
  for (const [path, label] of [
    ["/account/passkeys", t("passkeys")],
    ["/account/connections", t("mcpConnections")],
  ]) {
    await main.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(label);
    await expect(main).toBeFocused();
    if (compact) await expectUtilityActive(t("account"));
    await expectReflow(page, compact);
  }
  if (role === "ADMIN") await follow("/admin/users", t("admin"), true);

  // At 320 CSS pixels, use the actual language control in both directions.
  if ((await page.evaluate(() => innerWidth)) === 320) {
    for (const next of [locale === "en" ? "zh-TW" : "en", locale] as const) {
      const current = dictionary(next === "en" ? "zh-TW" : "en");
      const language = header.getByRole("combobox", {
        name: current("language"),
      });
      await expect(language).toBeInViewport({ ratio: 1 });
      await language.focus();
      await page.keyboard.press("Space");
      const option = page.getByRole("option", {
        name: next === "en" ? "English" : "正體中文",
        exact: true,
      });
      await expect(option).toBeInViewport({ ratio: 1 });
      await option.click();
      await expect(page.locator("html")).toHaveAttribute("lang", next);
      await expectReflow(page, true);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", next);
      await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    }
  }

  const signOutScope = compact ? await openMenu(page, t) : header;
  await signOutScope
    .getByRole("button", { name: t("signOut"), exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(t("signIn"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await prisma.session.count({ where: { userId: data.userId } })).toBe(
    0,
  );
  await page.goto("/workouts");
  await expect(page).toHaveURL(/\/login$/);
}

for (const role of ["USER", "ADMIN"] as const) {
  test.describe(`compact navigation for ${role}`, () => {
    test.use({ navigationRole: role });
    for (const locale of ["en", "zh-TW"] as const) {
      for (const width of [320, 390, 1440]) {
        test(`${locale} navigation at ${width}px`, async ({
          page,
          navigationData,
        }, info) => {
          await page.setViewportSize({ width, height: 900 });
          await verifyNavigation(
            page,
            navigationData,
            role,
            locale,
            width <= 720,
            info,
          );
        });
      }

      test(`${locale} navigation at real 200% Chrome browser zoom`, async ({
        page,
        context,
        navigationData,
      }, info) => {
        const directory = await mkdtemp(
          join(tmpdir(), "fitness-navigation-zoom-"),
        );
        let zoomContext: BrowserContext | undefined;
        try {
          const origin = new URL(page.url()).origin;
          // Same browser-settings method as ui-ux-remediation.spec.ts; no CSS zoom.
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
          await zoom.goto("/workouts");
          expect(await zoom.evaluate(() => devicePixelRatio)).toBe(2);
          expect(await zoom.evaluate(() => innerWidth)).toBeLessThanOrEqual(
            720,
          );
          await info.attach("browser-zoom.json", {
            body: JSON.stringify(
              await zoom.evaluate(() => ({
                innerWidth,
                innerHeight,
                devicePixelRatio,
                documentWidth: document.documentElement.scrollWidth,
              })),
            ),
            contentType: "application/json",
          });
          await verifyNavigation(
            zoom,
            navigationData,
            role,
            locale,
            true,
            info,
            true,
          );
        } finally {
          await zoomContext?.close();
          await rm(directory, { recursive: true, force: true });
        }
      });
    }
  });
}
