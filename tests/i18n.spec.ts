import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

test.afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { username: "i18n-admin" } });
  } finally {
    await prisma.$disconnect();
  }
});

test("language detection, switching, persistence, and authenticated routes", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "zh-TW" });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    const setup = new URL(page.url()).pathname === "/setup";
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await expect(
      page.getByRole("heading", {
        name: setup ? "建立第一個管理員帳號" : "登入",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "語言" }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", {
        name: setup ? "Create the first admin account" : "Sign in",
        exact: true,
      }),
    ).toBeVisible();
    const cookie = (await context.cookies()).find(
      ({ name }) => name === "locale",
    );
    expect(cookie).toMatchObject({
      value: "en",
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "正體中文" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    if (!setup) {
      await prisma.user.create({
        data: {
          username: "i18n-admin",
          passwordHash: await bcrypt.hash("test-password", 4),
          role: "ADMIN",
        },
      });
    }
    await page.getByLabel("使用者名稱", { exact: true }).fill("i18n-admin");
    await page.getByLabel("密碼", { exact: true }).fill("test-password");
    await page
      .getByRole("button", { name: setup ? "建立管理員" : "登入", exact: true })
      .click();
    await page.waitForURL("**/workouts");
    await expect(
      page.getByRole("heading", { name: "訓練", exact: true, level: 1 }),
    ).toBeVisible();
    for (const [route, heading] of [
      ["/calendar?year=2026&month=10&day=2026-10-12", "月曆"],
      ["/stats", "統計"],
      ["/exercises", "動作"],
      ["/measurements", "身體測量"],
      ["/data", "訓練資料"],
      ["/account/password", "變更密碼"],
    ]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
      await expect(
        page.getByRole("heading", { name: heading, exact: true, level: 1 }),
      ).toBeVisible();
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: "i18n-admin" },
    });
    const measurementDate = new Date(2026, 9, 12);
    await prisma.bodyMeasurement.create({
      data: { userId: user.id, date: measurementDate, weight: 72.5, waist: 80 },
    });
    await page.goto("/measurements");
    for (const locale of ["zh-TW", "en", "zh-TW"] as const) {
      if (locale !== (await page.locator("html").getAttribute("lang"))) {
        await page
          .getByRole("combobox", {
            name: locale === "en" ? "語言" : "Language",
          })
          .click();
        await page
          .getByRole("option", {
            name: locale === "en" ? "English" : "正體中文",
            exact: true,
          })
          .click();
      }
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const expectedDate = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(measurementDate);
      await expect(page.locator("tbody time")).toHaveText(expectedDate);
      await expect(page.locator("tbody time")).toHaveAttribute(
        "datetime",
        "2026-10-12",
      );
      for (const chart of await page.locator(".training-chart").all()) {
        await expect(chart.locator(".chart-data-row dt")).toHaveText(
          expectedDate,
        );
        await expect(chart.locator("g[role=button]")).toHaveAttribute(
          "aria-label",
          new RegExp(`^${expectedDate}:`),
        );
      }
      await expect(
        page.locator('input[type="hidden"][name="date"]'),
      ).toHaveValue("2026-10-12");
    }
    const stored = await prisma.bodyMeasurement.findUniqueOrThrow({
      where: { userId_date: { userId: user.id, date: measurementDate } },
    });
    expect(stored.date.getTime()).toBe(measurementDate.getTime());
    expect(stored.weight).toBe(72.5);
    await page.goto("/calendar?year=2026&month=10&day=2026-10-12");
    await expect(
      page.getByRole("heading", { name: "2026年10月", exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .exclude("nextjs-portal")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page.getByRole("combobox", { name: "語言" }).click();
    await page.getByRole("option", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(/year=2026&month=10&day=2026-10-12/);
    await expect(
      page.getByRole("heading", { name: "October 2026", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "正體中文" }).click();
    await expect(
      page.getByRole("heading", { name: "登入", exact: true }),
    ).toBeVisible();
    await page.getByLabel("使用者名稱", { exact: true }).fill("invalid");
    await page.getByLabel("密碼", { exact: true }).fill("invalid");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(
      page.getByText("使用者名稱或密碼錯誤。", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("unsupported Chinese preferences fall back without preventing an explicit choice", async ({
  browser,
}) => {
  for (const language of ["zh-CN", "zh-Hans", "zh-Hans-TW"]) {
    const context = await browser.newContext({
      extraHTTPHeaders: { "Accept-Language": `${language},en;q=0.8` },
    });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await page.getByRole("combobox", { name: "Language" }).click();
      await page.getByRole("option", { name: "正體中文" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    } finally {
      await context.close();
    }
  }
});

test("invalid stored locale uses the browser language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "zh-TW" });
  try {
    await context.addCookies([
      { name: "locale", value: "invalid", url: "http://localhost:8784" },
    ]);
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  } finally {
    await context.close();
  }
});
